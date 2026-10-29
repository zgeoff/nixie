import type { Transaction } from 'kysely';
import type { TasksTables } from './types';

export async function probePauseRequested(
  tx: Transaction<unknown>,
  taskID: string,
): Promise<boolean> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('pause_requested')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  return task.pause_requested === 1;
}
