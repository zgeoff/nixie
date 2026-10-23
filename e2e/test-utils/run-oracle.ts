import { writeUnknownOutcomes } from '@heynixie/actions';
import type { Log, Writer } from '@heynixie/log';
import { runProjectionRebuild } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { runRecovery } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { startTestLog } from './start-test-log';
import type { RecoveredState, TestNixie } from './start-test-nixie';

interface OracleReport {
  readonly repeatedStepKeys: readonly string[];

  readonly repeatedActions: readonly string[];

  readonly strayCalls: readonly (string | null)[];

  readonly heldLeases: readonly string[];

  readonly unreadyTasks: readonly string[];

  readonly changedEndStates: readonly string[];

  readonly projectionDrift: readonly string[];
}

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
      repeatedStepKeys: collectRepeats(
        records.filter((record) => record.kind === 'task.step_committed'),
        (record) => record.stepKey,
      ),
      repeatedActions: collectRepeats(
        records.filter((record) => record.kind === 'action.queued'),
        (record) => `${record.stepKey} ${String(record.payload['actionHash'])}`,
      ),
      strayCalls: collectStrayCalls(nixie, records),
      ...recovery,
      projectionDrift: await readProjectionDrift(context.log),
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
    changedEndStates: collectChangedEndStates([
      ...recovered.map((state) => state.tasks),
      before,
      states.at(-1)?.tasks ?? [],
    ]),
  };
}

function isUnready(task: Readonly<Record<string, unknown>>): boolean {
  return (
    task['state'] === 'running' ||
    (task['state'] === 'waiting' &&
      Number(task['last_inbox_sequence']) > Number(task['read_cursor']))
  );
}

function collectChangedEndStates(
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

function collectRepeats<T>(items: readonly T[], getKey: (item: T) => unknown): readonly string[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = String(getKey(item));

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts].filter(([, count]) => count > 1).map(([key]) => key);
}

function collectStrayCalls(
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

async function readProjectionDrift(log: Log): Promise<readonly string[]> {
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
