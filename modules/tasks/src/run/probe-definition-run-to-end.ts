import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { probeDefinitionRunPending } from './probe-definition-run-pending';

// Whether a task run of the task is open, or the next claim opens one.
export async function probeDefinitionRunToEnd(
  db: Kysely<unknown>,
  taskID: string,
): Promise<boolean> {
  const open = await db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .select('run_id')
    .where('task_id', '=', taskID)
    .where('ended_sequence', 'is', null)
    .limit(1)
    .executeTakeFirst();

  if (open !== undefined) {
    return true;
  }

  return probeDefinitionRunPending(db, taskID);
}
