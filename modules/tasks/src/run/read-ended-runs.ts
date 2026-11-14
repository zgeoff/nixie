import type { TasksContext, TasksTables } from '../types';
import { toTaskRun } from './to-task-run';
import type { TaskRun } from './types';

interface EndedRunsQuery {
  readonly definitionID?: string;
  readonly taskID?: string;

  // pages by the sequence of the end, newest first
  readonly beforeSequence?: number;
  readonly limit: number;
}

export async function readEndedRuns(
  context: Pick<TasksContext, 'log'>,
  query: EndedRunsQuery,
): Promise<readonly TaskRun[]> {
  const definitionID = query.definitionID;
  const taskID = query.taskID;
  const beforeSequence = query.beforeSequence;

  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('task_runs')
    .selectAll()
    .where('ended_sequence', 'is not', null)
    .$if(definitionID !== undefined, (builder) =>
      builder.where('definition_id', '=', definitionID ?? ''),
    )
    .$if(taskID !== undefined, (builder) => builder.where('task_id', '=', taskID ?? ''))
    .$if(beforeSequence !== undefined, (builder) =>
      builder.where('ended_sequence', '<', beforeSequence ?? 0),
    )
    .orderBy('ended_sequence', 'desc')
    .limit(query.limit)
    .execute();

  return rows.map((row) => toTaskRun(row));
}
