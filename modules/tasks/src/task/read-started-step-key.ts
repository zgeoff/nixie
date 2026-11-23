import type { TasksContext, TasksTables } from '../types';

// null when no step of the task runs, or when the task does not exist
export async function readStartedStepKey(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<string | null> {
  const task = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('started_step_key')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return task?.started_step_key ?? null;
}
