import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildPausedRecord } from '../task/record/build-paused-record';
import { runDueTimers } from '../task/run-due-timers';
import type { SandboxCleanup, TasksContext, TasksTables } from '../types';
import { taskLeaseExpiredCodec } from '../utils/task-lease-expired-codec';
import { taskStepInterruptedCodec } from '../utils/task-step-interrupted-codec';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface RestartSweepDependencies {
  readonly writeUnknownOutcomes: () => Promise<void>;

  readonly sandboxes: SandboxCleanup;
}

interface RestartSweepStep {
  readonly number: 1 | 2 | 3 | 4 | 5;
  readonly run: () => Promise<unknown>;
}

export async function runRestartSweep(
  context: TasksContext,
  dependencies: RestartSweepDependencies,
): Promise<void> {
  const steps: readonly RestartSweepStep[] = [
    { number: 1, run: () => resetStaleLeases(context) },
    { number: 2, run: () => writeInterruptedSteps(context) },
    { number: 3, run: () => dependencies.writeUnknownOutcomes() },
    { number: 4, run: () => runDueTimers(context) },
    { number: 5, run: () => dependencies.sandboxes.removeStaleSandboxes() },
  ];

  for (const step of steps) {
    await step.run();

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint(`restart_sweep.step.${step.number}`, {
        kind: 'restart_sweep',
        id: null,
      });
    }
  }
}

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
      .select(['task_id', 'pause_requested'])
      .where('state', '=', 'running')
      .orderBy('task_id')
      .execute();

    await writeRecordsInTransaction(
      tx,
      context.log,
      running.flatMap((task) => {
        const expired: RecordInput = {
          kind: 'task.lease_expired',
          definitions: context.definitions(),
          thread: task.task_id,
          payload: taskLeaseExpiredCodec.encode({ taskID: task.task_id }),
        };

        return task.pause_requested === 1
          ? [expired, buildPausedRecord(task.task_id, 'ready', context.definitions())]
          : [expired];
      }),
    );
  });
}

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
      started.map((task) => {
        const stepKey = task.started_step_key;

        invariant(stepKey !== null, 'the query reads only tasks with a started step');

        return {
          kind: 'task.step_interrupted',
          definitions: context.definitions(),
          thread: task.task_id,
          payload: taskStepInterruptedCodec.encode({ taskID: task.task_id, stepKey }),
        };
      }),
    );
  });
}
