import { probeDefinitionRunToEnd } from '../run/probe-definition-run-to-end';
import type { TaskRow, TaskState, TasksContext, TasksTables } from '../types';

export interface StartedTasksQuery {
  // A started task that is done or closed never runs again. One that stopped or failed can
  // restart, so it counts as open. A definition's task counts as open while its hash in force is
  // not null or one of its task runs is pending or open.
  readonly end: 'open' | 'ended';

  readonly among?: readonly string[];
}

export async function readStartedTaskIDs(
  context: Pick<TasksContext, 'log'>,
  query: StartedTasksQuery,
): Promise<readonly string[]> {
  if (query.among?.length === 0) {
    return [];
  }

  const db = context.log.writer.db;

  const rows = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state', 'definition_id', 'definition_hash'])
    .where((eb) => eb.or([eb('started_by', 'is not', null), eb('definition_id', 'is not', null)]))
    .$if(query.among !== undefined, (select) => select.where('task_id', 'in', query.among ?? []))
    .orderBy('created_sequence')
    .execute();

  const taskIDs: string[] = [];

  for (const row of rows) {
    const isOpen = await probeOpen(db, row);

    if (isOpen === (query.end === 'open')) {
      taskIDs.push(row.task_id);
    }
  }

  return taskIDs;
}

const endedStates: ReadonlySet<TaskState> = new Set(['done', 'closed']);

async function probeOpen(
  db: TasksContext['log']['writer']['db'],
  row: Pick<TaskRow, 'task_id' | 'state' | 'definition_id' | 'definition_hash'>,
): Promise<boolean> {
  if (row.definition_id === null) {
    return !endedStates.has(row.state);
  }

  if (row.definition_hash !== null) {
    return true;
  }

  const hasRunToEnd = await probeDefinitionRunToEnd(db, row.task_id);

  return hasRunToEnd;
}
