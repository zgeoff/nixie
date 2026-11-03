import type { TaskState, TasksContext, TasksTables } from './types';

export interface StartedTasksQuery {
  // A started task that is done or closed never runs again. One that stopped or failed can
  // restart, so it counts as open.
  readonly end: 'open' | 'ended';

  readonly among?: readonly string[];
}

const endedStates: readonly TaskState[] = ['done', 'closed'];

export async function readStartedTaskIDs(
  context: Pick<TasksContext, 'log'>,
  query: StartedTasksQuery,
): Promise<readonly string[]> {
  if (query.among?.length === 0) {
    return [];
  }

  const operator = query.end === 'ended' ? 'in' : 'not in';

  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('task_id')
    .where('started_by', 'is not', null)
    .where('state', operator, endedStates)
    .$if(query.among !== undefined, (select) => select.where('task_id', 'in', query.among ?? []))
    .orderBy('created_sequence')
    .execute();

  return rows.map((row) => row.task_id);
}
