import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

// The task run of a task that opened last, open or ended.
export async function readNewestRun(db: Kysely<unknown>, taskID: string): Promise<TaskRun | null> {
  const row = await db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('task_id', '=', taskID)
    .orderBy('opened_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : toTaskRun(row);
}
