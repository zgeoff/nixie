import type { TasksContext } from '@heynixie/tasks';
import { buildCancelledCheck } from './build-cancelled-check';
import type { ActionsTables, ListedAction } from './types';

export interface TaskActions {
  readonly queued: readonly ListedAction[];
  readonly started: readonly ListedAction[];
}

export async function readTaskActions(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<TaskActions> {
  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'tool', 'attempt_count'])
    .where('task_id', '=', taskID)
    .where('status', '=', 'pending')
    .where((eb) => eb.not(buildCancelledCheck(eb)))
    .orderBy('queued_sequence')
    .execute();

  return {
    queued: rows
      .filter((row) => row.attempt_count === 0)
      .map((row) => ({ actionID: row.action_id, tool: row.tool })),
    started: rows
      .filter((row) => row.attempt_count > 0)
      .map((row) => ({ actionID: row.action_id, tool: row.tool })),
  };
}
