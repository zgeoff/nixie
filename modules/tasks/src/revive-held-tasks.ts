import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { taskRevivedCodec } from './task-revived-codec';
import type { TasksContext, TasksTables } from './types';

// A started task that waits with unread input, or that never opened a session, has work its brief
// or its inbox still holds. Only a waking inbox record moves a waiting task to ready, so without
// this sweep such a task would wait for a message that may never come.
export function reviveHeldTasks(
  context: Pick<TasksContext, 'definitions' | 'log'>,
): Promise<number> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const held = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('task_id')
      .where('started_by', 'is not', null)
      .where('state', '=', 'waiting')
      .where((eb) =>
        eb.or([
          eb('read_cursor', '<', eb.ref('last_inbox_sequence')),
          eb('session_boundary', 'is', null),
        ]),
      )
      .orderBy('created_sequence')
      .execute();

    await writeRecordsInTransaction(
      tx,
      context.log,
      held.map((task) => ({
        kind: 'task.revived',
        definitions: context.definitions(),
        thread: task.task_id,
        payload: taskRevivedCodec.encode({ taskID: task.task_id }),
      })),
    );

    return held.length;
  });
}
