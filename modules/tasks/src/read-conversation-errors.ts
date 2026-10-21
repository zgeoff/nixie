import type { Kysely } from 'kysely';
import { conversationTaskID } from './conversation-task-id';
import type { TasksTables } from './types';

export async function readConversationErrors(db: Kysely<unknown>): Promise<number> {
  const task = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('step_errors')
    .where('task_id', '=', conversationTaskID)
    .executeTakeFirst();

  return task?.step_errors ?? 0;
}
