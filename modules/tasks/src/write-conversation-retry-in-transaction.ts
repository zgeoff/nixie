import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { conversationTaskID } from './conversation-task-id';
import { taskRevivedCodec } from './task-revived-codec';
import type { TaskState, TasksContext, TasksTables } from './types';

export type ConversationRetryOutcome =
  | { readonly status: 'retried' }
  | { readonly status: 'refused' };

// The caller must hold the writer's write transaction, so the check of the conversation's failed
// step and the record that retries it commit together.
export async function writeConversationRetryInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log' | 'definitions'>,
): Promise<ConversationRetryOutcome> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'step_errors'])
    .where('task_id', '=', conversationTaskID)
    .executeTakeFirst();

  if (task === undefined || !canRetryConversation(task.state, task.step_errors)) {
    return { status: 'refused' };
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.revived',
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: taskRevivedCodec.encode({ taskID: conversationTaskID }),
    },
  ]);

  return { status: 'retried' };
}

// Only a step error leaves errors in a row on the task, and a commit or a revival clears them, so the
// conversation's last step failed exactly when the count is above 0.
function canRetryConversation(state: TaskState, stepErrors: number): boolean {
  return stepErrors > 0 && (state === 'ready' || state === 'waiting');
}
