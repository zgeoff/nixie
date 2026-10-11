import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';
import type { TasksContext, TasksTables } from './types';

// Creates the conversation's task on first start and leaves it be on every start after. It has no
// brief, so it waits for your first message.
export async function createConversationTask(
  context: Pick<TasksContext, 'definitions' | 'log'>,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const existing = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('task_id')
      .where('task_id', '=', conversationTaskID)
      .executeTakeFirst();

    if (existing !== undefined) {
      return;
    }
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.created',
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: { taskID: conversationTaskID, isConversation: true, state: 'waiting' },
      },
    ]);
  });
}
