import type { TasksContext, TasksTables } from './types';

export async function readTaskStarter(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<string | null> {
  const row = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('started_by')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return row?.started_by ?? null;
}
