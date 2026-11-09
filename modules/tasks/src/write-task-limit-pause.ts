import { withWriteTransaction } from '@heynixie/log';
import { isFinishedState } from '@heynixie/task-control';
import { requireLease } from './require-lease';
import { taskLimitNoticeCodec } from './task-limit-notice-codec';
import type { Lease, TaskLimits, TaskState, TasksContext, TasksTables } from './types';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';
import { writeTaskControlInTransaction } from './write-task-control-in-transaction';
import { writeTaskLimitHoldInTransaction } from './write-task-limit-hold-in-transaction';

export interface TaskLimitPause {
  readonly lease: Lease;
  readonly stepKey: string;
  readonly startedBy: string;
  readonly used: TaskLimits;
  readonly limits: TaskLimits;
}

// The step that meets the limit still holds its lease, so the pause is a request that its commit
// carries out, and the hold and the starter's notice commit with that request.
export async function writeTaskLimitPause(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  pause: TaskLimitPause,
): Promise<void> {
  const taskID = pause.lease.workID;
  const counts = { used: pause.used, limits: pause.limits };

  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, pause.lease, context.clock.now());
    await writeTaskControlInTransaction(tx, context, { taskID, control: 'pause' });

    await writeTaskLimitHoldInTransaction(tx, context, taskID, {
      kind: 'reach',
      stepKey: pause.stepKey,
      ...counts,
    });

    const starter = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('state')
      .where('task_id', '=', pause.startedBy)
      .executeTakeFirst();

    if (isStarterNotified(starter?.state ?? null)) {
      await writeInboxRecordsInTransaction(tx, context, [
        {
          kind: 'task.limit_notice',
          definitions: context.definitions(),
          thread: pause.startedBy,
          payload: taskLimitNoticeCodec.encode({ taskID, ...counts }),
        },
      ]);
    }
  });
}

// A starter that is gone or finished reads no inbox, which refuses its input.
function isStarterNotified(starterState: TaskState | null): boolean {
  return starterState !== null && !isFinishedState(starterState);
}
