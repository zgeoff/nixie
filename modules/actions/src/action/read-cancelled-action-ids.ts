import type { TasksContext } from '@heynixie/tasks';
import type { ActionsTables } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';

export async function readCancelledActionIDs(
  context: Pick<TasksContext, 'log'>,
  actionIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  if (actionIDs.length === 0) {
    return new Set();
  }

  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('action_id')
    .where('action_id', 'in', actionIDs)
    .where((eb) => buildCancelledCheck(eb))
    .execute();

  return new Set(rows.map((row) => row.action_id));
}
