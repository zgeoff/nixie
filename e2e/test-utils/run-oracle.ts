import { buildTestClock } from '../../libs/testing/src/index';
import { writeUnknownOutcomes } from '../../modules/actions/src/index';
import type { Log, Writer } from '../../modules/log/src/index';
import { runProjectionRebuild } from '../../modules/log/src/index';
import type { TasksContext } from '../../modules/tasks/src/index';
import { runRecovery } from '../../modules/tasks/src/index';
import { startTestLog } from '../nixie/start-test-log';
import type { RecoveredState, TestNixie } from './start-test-nixie';

// What the crash tests' one oracle found. A clean run finds every list empty.
interface OracleReport {
  // step keys with more than one commit
  readonly repeatedStepKeys: readonly string[];

  // calls that one step queued as more than one action, as step key and action hash
  readonly repeatedActions: readonly string[];

  // idempotency keys of provider calls beyond the attempts that an action made with that key
  readonly strayCalls: readonly (string | null)[];

  // work that still held a lease once a start's recovery ran, as the start's number, kind and ID
  readonly heldLeases: readonly string[];

  // tasks that a start's recovery left running, or left waiting with unread input
  readonly unreadyTasks: readonly string[];

  // tasks that reached done or failed and later held another state
  readonly changedEndStates: readonly string[];

  // projection tables whose rows a fold of the whole log does not rebuild
  readonly projectionDrift: readonly string[];
}

// Runs the oracle that ends every crash test, once every nixie has exited: it checks what each
// start's recovery left, runs recovery once more as a last restart, and compares every projection
// with a fold of the whole log.
export async function runOracle(nixie: TestNixie): Promise<OracleReport> {
  const testLog = await startTestLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: buildTestClock(nixie.harness.now()),
  });
  const context = testLog.context;

  try {
    const recovery = await runRecoveryChecks(context, nixie);
    const records = await nixie.readRecords();

    return {
      repeatedStepKeys: findRepeats(
        records.filter((record) => record.kind === 'task.step_committed'),
        (record) => record.stepKey,
      ),
      repeatedActions: findRepeats(
        records.filter((record) => record.kind === 'action.queued'),
        (record) => `${record.stepKey} ${String(record.payload['actionHash'])}`,
      ),
      strayCalls: findStrayCalls(nixie, records),
      ...recovery,
      projectionDrift: await findProjectionDrift(context.log),
    };
  } finally {
    await testLog.writer.stop();
  }
}

type RecoveryChecks = Pick<OracleReport, 'changedEndStates' | 'heldLeases' | 'unreadyTasks'>;

async function runRecoveryChecks(context: TasksContext, nixie: TestNixie): Promise<RecoveryChecks> {
  const recovered = nixie.readRecoveredStates();
  const before = await nixie.readRows('tasks');

  await runRecovery(context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  const states: readonly RecoveredState[] = [
    ...recovered,
    { leases: await nixie.readRows('leases'), tasks: await nixie.readRows('tasks') },
  ];

  return {
    heldLeases: states.flatMap((state, index) =>
      state.leases
        .filter((lease) => lease['holder'] !== null)
        .map((lease) => `${index}:${String(lease['kind'])}:${String(lease['work_id'])}`),
    ),
    unreadyTasks: states.flatMap((state, index) =>
      state.tasks
        .filter((task) => isUnready(task))
        .map((task) => `${index}:${String(task['task_id'])}`),
    ),
    changedEndStates: findChangedEndStates([
      ...recovered.map((state) => state.tasks),
      before,
      states.at(-1)?.tasks ?? [],
    ]),
  };
}

// a running task, or a waiting one with input it has not read
function isUnready(task: Readonly<Record<string, unknown>>): boolean {
  return (
    task['state'] === 'running' ||
    (task['state'] === 'waiting' &&
      Number(task['last_inbox_sequence']) > Number(task['read_cursor']))
  );
}

// each task whose state, once done or failed, differs in a later read of the tasks
function findChangedEndStates(
  reads: readonly (readonly Readonly<Record<string, unknown>>[])[],
): readonly string[] {
  const ended = new Map<unknown, unknown>();
  const changed = new Set<string>();

  for (const tasks of reads) {
    for (const task of tasks) {
      const endState = ended.get(task['task_id']);

      if (endState !== undefined && endState !== task['state']) {
        changed.add(String(task['task_id']));
      }
      if (endState === undefined && (task['state'] === 'done' || task['state'] === 'failed')) {
        ended.set(task['task_id'], task['state']);
      }
    }
  }
  return [...changed];
}

function findRepeats<T>(items: readonly T[], getKey: (item: T) => unknown): readonly string[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = String(getKey(item));

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key);
}

function findStrayCalls(
  nixie: TestNixie,
  records: Awaited<ReturnType<TestNixie['readRecords']>>,
): readonly (string | null)[] {
  const attempts = new Map<unknown, number>();

  for (const record of records.filter((entry) => entry.kind === 'action.attempt_started')) {
    attempts.set(record.payload['actionID'], (attempts.get(record.payload['actionID']) ?? 0) + 1);
  }
  return nixie.provider.calls
    .map((call) => call.idempotencyKey)
    .filter((key) => {
      const remaining = key === null ? 0 : (attempts.get(key) ?? 0);

      attempts.set(key, remaining - 1);
      return remaining <= 0;
    });
}

// every projection's table and the projection changes, before and after a rebuild
async function findProjectionDrift(log: Log): Promise<readonly string[]> {
  const tables = [...log.projections.map((projection) => projection.table), 'projection_changes'];
  const readTables = () => Promise.all(tables.map((table) => readTable(log.writer.db, table)));
  const live = await readTables();

  await runProjectionRebuild(log);

  const rebuilt = await readTables();

  return tables.filter((_table, index) => !Bun.deepEquals(live[index], rebuilt[index]));
}

async function readTable(db: Writer['db'], table: string): Promise<readonly unknown[]> {
  const rows = await db
    .$extendTables<Readonly<Record<string, Readonly<Record<string, unknown>>>>>()
    .selectFrom(table)
    .selectAll()
    .execute();

  return rows.map((row) => JSON.stringify(row)).toSorted();
}
