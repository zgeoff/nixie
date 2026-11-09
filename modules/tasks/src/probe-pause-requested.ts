import type { Kysely } from 'kysely';
import type { TasksTables } from './types';

export async function probePauseRequested(db: Kysely<unknown>, taskID: string): Promise<boolean> {
  const task = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('pause_requested')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  return task.pause_requested === 1;
}
