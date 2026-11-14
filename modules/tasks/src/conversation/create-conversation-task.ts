import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import type { TasksContext, TasksTables } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import { taskRevivedCodec } from '../utils/task-revived-codec';

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
