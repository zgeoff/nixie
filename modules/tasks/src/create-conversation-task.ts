import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';
import { taskCreatedCodec } from './task-created-codec';
import { taskRevivedCodec } from './task-revived-codec';
import type { TasksContext, TasksTables } from './types';

export async function createConversationTask(
  context: Pick<TasksContext, 'definitions' | 'log'>,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const existing = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('state')
      .where('task_id', '=', conversationTaskID)
      .executeTakeFirst();

    if (existing?.state === 'failed') {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'task.revived',
          definitions: context.definitions(),
          thread: conversationTaskID,
          payload: taskRevivedCodec.encode({ taskID: conversationTaskID }),
        },
      ]);

      return;
    }

    if (existing !== undefined) {
      return;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.created',
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: taskCreatedCodec.encode({
          taskID: conversationTaskID,
          isConversation: true,
          state: 'waiting',
        }),
      },
    ]);
  });
}
