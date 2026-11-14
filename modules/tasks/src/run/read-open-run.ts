import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

// The task run of a task that has not ended, which the unique partial index limits to one.
export async function readOpenRun(db: Kysely<unknown>, taskID: string): Promise<TaskRun | null> {
  const row = await db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('task_id', '=', taskID)
    .where('ended_sequence', 'is', null)
    .executeTakeFirst();

  return row === undefined ? null : toTaskRun(row);
}
