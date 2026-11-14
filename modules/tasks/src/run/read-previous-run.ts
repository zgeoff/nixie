import type { TasksContext, TasksTables } from '../types';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

// The newest task run of the same task that opened before this one.
export async function readPreviousRun(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
): Promise<TaskRun | null> {
  const row = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('task_id', '=', run.taskID)
    .where('opened_sequence', '<', run.openedSequence)
    .orderBy('opened_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row === undefined ? null : toTaskRun(row);
}
