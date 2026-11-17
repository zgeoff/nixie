import { sql } from 'kysely';
import type { TasksContext, TasksTables } from '../types';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

// The ended task run whose end record holds the report ID, or null when none does.
export async function readEndedRunByReportID(
  context: Pick<TasksContext, 'log'>,
  reportID: string,
): Promise<TaskRun | null> {
  const row = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('ended_sequence', 'is not', null)
    .where(sql`json_extract(ended, '$.reportID')`, '=', reportID)
    .executeTakeFirst();

  return row === undefined ? null : toTaskRun(row);
}
