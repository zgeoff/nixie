import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease } from '../lease/require-lease';
import { buildPausedRecord } from '../task/record/build-paused-record';
import type { StartedClaim, TasksContext, TasksTables } from '../types';
import { resetLease } from '../utils/reset-lease';
import { taskLeaseExpiredCodec } from '../utils/task-lease-expired-codec';
import { taskStepInterruptedCodec } from '../utils/task-step-interrupted-codec';

// A step that the gate held ends with no commit: the task goes back to ready, with the work it had,
// and the lease frees. A control that changed the task meanwhile, such as a stop, keeps its state.
export async function writeStepHeld(context: TasksContext, claim: StartedClaim): Promise<void> {
  const taskID = claim.lease.workID;
  const definitions = context.definitions();

  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, claim.lease, context.clock.now());

    const task = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select(['state', 'started_step_key', 'pause_requested'])
      .where('task_id', '=', taskID)
      .executeTakeFirstOrThrow();

    const isRunning = task.state === 'running' && task.started_step_key === claim.stepKey;

    if (isRunning) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'task.step_interrupted',
          definitions,
          thread: taskID,
          payload: taskStepInterruptedCodec.encode({ taskID, stepKey: claim.stepKey }),
        },
        {
          kind: 'task.lease_expired',
          definitions,
          thread: taskID,
          payload: taskLeaseExpiredCodec.encode({ taskID }),
        },
        ...(task.pause_requested === 1 ? [buildPausedRecord(taskID, 'ready', definitions)] : []),
      ]);
    }

    await resetLease(tx, claim.lease);
  });
}
