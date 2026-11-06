import { writeUnknownOutcomes } from '@heynixie/actions';
import { readTestProjectionDrift } from '@heynixie/log/test-utils';
import type { TaskState, TasksContext } from '@heynixie/tasks';
import { runRecovery } from '@heynixie/tasks';
import type { TestTask } from '@heynixie/tasks/test-utils';
import { buildTestClock } from '@heynixie/testing';
import { startDataLog } from './start-data-log';
import type { RecoveredState, SpawnedNixie } from './start-spawned-nixie';

interface OracleReport {
  readonly repeatedStepKeys: readonly string[];

  readonly repeatedActions: readonly string[];

  readonly strayCalls: readonly (string | null)[];

  readonly heldLeases: readonly string[];

  readonly unreadyTasks: readonly string[];

  readonly changedEndStates: readonly string[];

  readonly projectionDrift: readonly string[];
}

export async function runOracle(nixie: SpawnedNixie): Promise<OracleReport> {
  const testLog = await startDataLog({
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
      projectionDrift: await readTestProjectionDrift(context.log),
    };
  } finally {
    await testLog.writer.stop();
  }
}

type RecoveryChecks = Pick<OracleReport, 'changedEndStates' | 'heldLeases' | 'unreadyTasks'>;

async function runRecoveryChecks(
  context: TasksContext,
  nixie: SpawnedNixie,
): Promise<RecoveryChecks> {
  const recovered = nixie.readRecoveredStates();

  const before = await nixie.readTasks();

  await runRecovery(context, {
    writeUnknownOutcomes: () => writeUnknownOutcomes(context),
    sandboxes: { removeStaleSandboxes: () => Promise.resolve() },
  });

  const states: readonly RecoveredState[] = [
    ...recovered,
    { leases: await nixie.readLeases(), tasks: await nixie.readTasks() },
  ];

  return {
    heldLeases: states.flatMap((state, index) =>
      state.leases
        .filter((lease) => lease.holder !== null)
        .map((lease) => `${index}:${lease.kind}:${lease.workID}`),
    ),
    unreadyTasks: states.flatMap((state, index) =>
      state.tasks.filter((task) => isUnready(task)).map((task) => `${index}:${task.id}`),
    ),
    changedEndStates: collectChangedEndStates([
      ...recovered.map((state) => state.tasks),
      before,
      states.at(-1)?.tasks ?? [],
    ]),
  };
}

function isUnready(task: TestTask): boolean {
  return (
    task.state === 'running' ||
    (task.state === 'waiting' && task.lastInboxSequence > task.readCursor)
  );
}

function collectChangedEndStates(reads: readonly (readonly TestTask[])[]): readonly string[] {
  const ended = new Map<string, TaskState>();
  const changed = new Set<string>();

  for (const tasks of reads) {
    for (const task of tasks) {
      const endState = ended.get(task.id);

      if (endState !== undefined && endState !== task.state) {
        changed.add(task.id);
      }

      if (endState === undefined && (task.state === 'done' || task.state === 'failed')) {
        ended.set(task.id, task.state);
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
  nixie: SpawnedNixie,
  records: Awaited<ReturnType<SpawnedNixie['readRecords']>>,
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
