import { buildTestClock } from '../../libs/testing/src/index';
import { writeUnknownOutcomes } from '../../modules/actions/src/index';
import type { Log, Writer } from '../../modules/log/src/index';
import { runProjectionRebuild } from '../../modules/log/src/index';
import type { TasksContext, TasksTables } from '../../modules/tasks/src/index';
import { runRecovery } from '../../modules/tasks/src/index';
import { startTestLog } from '../nixie/start-test-log';
import type { TestNixie } from './start-test-nixie';

// What the crash tests' one oracle found. A clean run finds every list empty.
interface OracleReport {
  // step keys with more than one commit
  readonly repeatedStepKeys: readonly string[];

  // action IDs with more than one queue entry
  readonly repeatedActionIDs: readonly string[];

  // idempotency keys of provider calls that no attempt of an action made
  readonly strayCalls: readonly (string | null)[];

  // work that still holds a lease once recovery ran
  readonly heldLeases: readonly string[];

  // tasks that recovery left running, or left waiting with unread input
  readonly unreadyTasks: readonly string[];

  // tasks that ended as done or failed and changed state in recovery
  readonly changedEndStates: readonly string[];

  // projection tables whose rows a fold of the whole log does not rebuild
  readonly projectionDrift: readonly string[];
}

// Runs the oracle that ends every crash test, once every nixie process has exited: it takes the
// writer itself, runs recovery as a restart does, checks the leases and the task states, and drops
// and folds every projection from the log, comparing the rebuilt rows with the live ones.
export async function runOracle(nixie: TestNixie): Promise<OracleReport> {
  const testLog = await startTestLog({
    dataDir: nixie.dataDir,
    deploymentKey: nixie.deploymentKey,
    clock: buildTestClock(nixie.harness.now()),
  });
  const context = testLog.context;

  try {
    const recovery = await runRecoveryChecks(context);
    const records = await nixie.readRecords();

    return {
      repeatedStepKeys: findRepeats(
        records.filter((record) => record.kind === 'task.step_committed'),
        (record) => record.stepKey,
      ),
      repeatedActionIDs: findRepeats(
        records.filter((record) => record.kind === 'action.queued'),
        (record) => record.payload['actionID'],
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

async function runRecoveryChecks(context: TasksContext): Promise<RecoveryChecks> {
  const before = await readTasks(context.log.writer.db);

  await runRecovery(context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  const after = await readTasks(context.log.writer.db);

  return {
    heldLeases: await findHeldLeases(context.log.writer.db),
    unreadyTasks: after
      .filter(
        (task) =>
          task.state === 'running' ||
          (task.state === 'waiting' && task.last_inbox_sequence > task.read_cursor),
      )
      .map((task) => task.task_id),
    changedEndStates: before
      .filter((task) => task.state === 'done' || task.state === 'failed')
      .filter((task) => after.find((row) => row.task_id === task.task_id)?.state !== task.state)
      .map((task) => task.task_id),
  };
}

type TaskRow = TasksTables['tasks'];

function readTasks(db: Writer['db']): Promise<readonly TaskRow[]> {
  return db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .selectAll()
    .orderBy('task_id')
    .execute();
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
  const attempted = new Set(
    records
      .filter((record) => record.kind === 'action.attempt_started')
      .map((record) => record.payload['actionID']),
  );

  return nixie.provider.calls
    .map((call) => call.idempotencyKey)
    .filter((key) => key === null || !attempted.has(key));
}

async function findHeldLeases(db: Writer['db']): Promise<readonly string[]> {
  const rows = await db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select(['kind', 'work_id'])
    .where('holder', 'is not', null)
    .execute();

  return rows.map((row) => `${row.kind}:${row.work_id}`);
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
