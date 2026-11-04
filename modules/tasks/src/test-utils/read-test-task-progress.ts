import type { TaskState, TasksContext, TasksTables } from '../types';

export interface TestTaskProgress {
  readonly state: TaskState;
  readonly stepErrors: number;
  readonly readCursor: number;
  readonly sessionBoundary: string | null;
}

export async function readTestTaskProgress(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<TestTaskProgress> {
  const task = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'step_errors', 'read_cursor', 'session_boundary'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  return {
    state: task.state,
    stepErrors: task.step_errors,
    readCursor: task.read_cursor,
    sessionBoundary: task.session_boundary,
  };
}
