import type { TasksContext } from '@heynixie/tasks';
import type { ActionsTables } from '../types';

export interface ActionCall {
  readonly tool: string;

  // The sequence of the tool call record that made the action, which is null for an action that no
  // call made.
  readonly callSequence: number | null;
}

export async function readActionCalls(
  context: Pick<TasksContext, 'log'>,
  actionIDs: readonly string[],
): Promise<ReadonlyMap<string, ActionCall>> {
  if (actionIDs.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'tool', 'call_sequence'])
    .where('action_id', 'in', actionIDs)
    .execute();

  return new Map(
    rows.map((row) => [row.action_id, { tool: row.tool, callSequence: row.call_sequence }]),
  );
}
