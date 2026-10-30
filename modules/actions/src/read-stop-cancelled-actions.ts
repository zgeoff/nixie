import type { TasksContext } from '@heynixie/tasks';
import type { ActionsTables, ListedAction } from './types';

export async function readStopCancelledActions(
  context: Pick<TasksContext, 'log'>,
  stopSequences: readonly number[],
): Promise<ReadonlyMap<number, readonly ListedAction[]>> {
  if (stopSequences.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'tool', 'cancelled_sequence'])
    .where('cancelled_sequence', 'in', stopSequences)
    .orderBy('queued_sequence')
    .execute();

  return new Map(
    stopSequences.map((sequence) => [
      sequence,
      rows
        .filter((row) => row.cancelled_sequence === sequence)
        .map((row) => ({ actionID: row.action_id, tool: row.tool })),
    ]),
  );
}
