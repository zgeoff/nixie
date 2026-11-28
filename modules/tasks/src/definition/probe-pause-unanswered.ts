import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';

// A step that fails clears the task's pause request and writes no task.paused, so only the
// thread's newest pause or restart record shows that the user's pause still stands.
export async function probePauseUnanswered(db: Kysely<unknown>, taskID: string): Promise<boolean> {
  const row = await db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('kind')
    .where('thread', '=', taskID)
    .where('kind', 'in', [
      'task.pause_requested',
      'task.paused',
      'task.resumed',
      'task.restarted',
      'task.revived',
    ])
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row?.kind === 'task.pause_requested';
}
