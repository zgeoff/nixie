import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

// A task's task runs, oldest first. A caller inside a write transaction passes it as the handle,
// so the read sees what the transaction wrote.
export async function readRunRows(
  db: Kysely<unknown>,
  taskID: string,
): Promise<readonly TaskRun[]> {
  const rows = await db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('task_id', '=', taskID)
    .orderBy('opened_sequence')
    .execute();

  return rows.map((row) => toTaskRun(row));
}
