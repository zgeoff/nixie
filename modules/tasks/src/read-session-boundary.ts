import type { TasksContext, TasksTables } from './types';

export async function readSessionBoundary(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<string | null> {
  const task = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('session_boundary')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  return task.session_boundary;
}
