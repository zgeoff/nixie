import type { Kysely } from 'kysely';
import { conversationTaskID } from './conversation-task-id';
import type { TasksTables } from './types';

export interface ConversationErrors {
  readonly errors: number;

  readonly isWaitingForRetry: boolean;
}

// Only a step error leaves errors in a row on the task, so a waiting conversation with errors waits
// for the user to retry its failed turn.
export async function readConversationErrors(db: Kysely<unknown>): Promise<ConversationErrors> {
  const task = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['step_errors', 'state'])
    .where('task_id', '=', conversationTaskID)
    .executeTakeFirst();

  const errors = task?.step_errors ?? 0;

  return { errors, isWaitingForRetry: errors > 0 && task?.state === 'waiting' };
}
