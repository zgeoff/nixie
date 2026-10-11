import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { runDueTimers } from './run-due-timers';
import type { SandboxCleanup, TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

// Work that recovery needs from modules that depend on tasks, which the server passes in, because
// modules form no cycles.
export interface RecoveryDependencies {
  // step 3: marks each action that started an attempt without a recorded result as unknown
  readonly writeUnknownOutcomes: () => Promise<void>;

  // step 5
  readonly sandboxes: SandboxCleanup;
}

// Resumes every task after a crash, before any runner starts, in a process that holds the writer
// lock under a new epoch, so every lease still held belongs to a process that is gone. Each step is
// safe to run again, so the next start finishes a recovery that crashed.
export async function runRecovery(
  context: TasksContext,
  dependencies: RecoveryDependencies,
): Promise<void> {
  const steps: readonly RecoveryStep[] = [
    { number: 1, run: () => resetStaleLeases(context) },
    { number: 2, run: () => writeInterruptedSteps(context) },
    { number: 3, run: () => dependencies.writeUnknownOutcomes() },
    { number: 4, run: () => runDueTimers(context) },
    { number: 5, run: () => dependencies.sandboxes.removeStaleSandboxes() },
  ];

  for (const step of steps) {
    // oxlint-disable-next-line no-await-in-loop -- the steps run in order
    await step.run();
    if (NIXIE_TEST_BUILD) {
      // oxlint-disable-next-line no-await-in-loop -- the harness holds each step in turn
      await waitAtFaultPoint(`recovery.step.${step.number}`, { kind: 'recovery', id: null });
    }
  }
}

interface RecoveryStep {
  readonly number: 1 | 2 | 3 | 4 | 5;
  readonly run: () => Promise<unknown>;
}

// Step 1: frees every lease claimed under an older writer epoch, and returns each running task to
// ready with a record.
async function resetStaleLeases(context: TasksContext): Promise<void> {
  const writer = context.log.writer;

  await withWriteTransaction(writer, async (tx) => {
    const db = tx.$extendTables<TasksTables>();

    await db
      .updateTable('leases')
      .set({ holder: null, expires_at: null })
      .where('holder', 'is not', null)
      .where('epoch', '<', writer.epoch)
      .execute();

    const running = await db
      .selectFrom('tasks')
      .select('task_id')
      .where('state', '=', 'running')
      .orderBy('task_id')
      .execute();

    await writeRecordsInTransaction(
      tx,
      context.log,
      running.map((task) => ({
        kind: 'task.lease_expired',
        definitions: context.definitions(),
        thread: task.task_id,
        payload: { taskID: task.task_id },
      })),
    );
  });
}

// Step 2: marks each step that started without a commit as interrupted, with a record.
async function writeInterruptedSteps(context: TasksContext): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const started = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['task_id', 'started_step_key'])
      .where('started_step_key', 'is not', null)
      .orderBy('task_id')
      .execute();

    await writeRecordsInTransaction(
      tx,
      context.log,
      started.map((task) => ({
        kind: 'task.step_interrupted',
        definitions: context.definitions(),
        thread: task.task_id,
        payload: { taskID: task.task_id, stepKey: task.started_step_key },
      })),
    );
  });
}
