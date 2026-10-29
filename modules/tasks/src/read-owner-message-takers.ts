import { isTakingOwnerMessages } from './is-taking-owner-messages';
import type { TasksContext, TasksTables } from './types';

export async function readOwnerMessageTakers(
  context: Pick<TasksContext, 'log'>,
  taskIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  if (taskIDs.length === 0) {
    return new Set();
  }

  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'is_conversation', 'started_by'])
    .where('task_id', 'in', [...taskIDs])
    .execute();

  return new Set(rows.filter((row) => isTakingOwnerMessages(row)).map((row) => row.task_id));
}
