import type { TasksContext } from '@heynixie/tasks';
import type { ActionsTables } from '../types';

export async function readActionTools(
  context: Pick<TasksContext, 'log'>,
  actionIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (actionIDs.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'tool'])
    .where('action_id', 'in', actionIDs)
    .execute();

  return new Map(rows.map((row) => [row.action_id, row.tool]));
}
