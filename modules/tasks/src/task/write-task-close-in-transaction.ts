import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { writeRunEndInTransaction } from '../run/write-run-end-in-transaction';
import type { TasksContext, TasksTables } from '../types';
import type { taskClosedByValues } from './codec/task-closed-codec';
import { taskClosedCodec } from './codec/task-closed-codec';

export interface TaskClose {
  readonly taskID: string;

  // the step that holds or held the task, which the close stops
  readonly stepKey: string | null;
  readonly closedBy: (typeof taskClosedByValues)[number];
  readonly endedBy: string;

  // the thread that made the close, or null when no thread did, as with the owner's control
  readonly closer: string | null;
}

type CloseContext = Pick<TasksContext, 'log' | 'definitions' | 'runSettings' | 'runners'>;

// The one function that closes a task. The caller holds the write transaction and has checked that
// the task takes a close. It frees the lease, so a step whose lease is gone commits nothing even
// when it ignores its abort, and it ends the open task run with the cause closed.
export async function writeTaskCloseInTransaction(
  tx: Transaction<unknown>,
  context: CloseContext,
  close: TaskClose,
): Promise<number> {
  const db = tx.$extendTables<TasksTables>();

  const timers = await db
    .selectFrom('timers')
    .select('timer_id')
    .where('task_id', '=', close.taskID)
    .where('fired_at', 'is', null)
    .where('withdrawn_sequence', 'is', null)
    .orderBy('due_at')
    .execute();

  await db
    .updateTable('leases')
    .set({ holder: null, expires_at: null })
    .where('kind', '=', sql.lit('task'))
    .where('work_id', '=', close.taskID)
    .execute();

  const [record] = await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.closed',
      definitions: context.definitions(),
      thread: close.taskID,
      payload: taskClosedCodec.encode({
        taskID: close.taskID,
        stepKey: close.stepKey,
        timerIDs: timers.map((timer) => timer.timer_id),
        closedBy: close.closedBy,
      }),
    },
  ]);

  invariant(record, 'the close writes its record');

  await writeRunEndInTransaction(tx, context, {
    taskID: close.taskID,
    trigger: { kind: 'closed', closer: close.closer },
    endedBy: close.endedBy,
    stepKey: null,
  });

  return record.sequence;
}
