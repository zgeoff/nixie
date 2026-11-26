import type { ActionsTables } from '@heynixie/actions';
import type { PackageCallSource } from '@heynixie/devices';
import type { Log } from '@heynixie/log';

// The call record that queued an action, on the thread of that call, or null for an action that no
// call made.
export async function readActionCallSource(
  log: Pick<Log, 'writer'>,
  actionID: string,
): Promise<PackageCallSource | null> {
  const row = await log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['task_id', 'call_sequence'])
    .where('action_id', '=', actionID)
    .executeTakeFirst();

  return row?.call_sequence === undefined || row.call_sequence === null
    ? null
    : { callSequence: row.call_sequence, thread: row.task_id };
}
