import type { Log, LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';

// Removes the key of a saved offer's record, so the offered text lives on only under its item's
// key and a forget of the item leaves no readable copy in the log.
export async function removeOfferKey(
  log: Pick<Log, 'writer'>,
  offerSequence: number,
): Promise<void> {
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('memory.offer.saved', { kind: 'memory', id: null });
  }

  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', offerSequence)
    .executeTakeFirst();

  if (typeof row?.key_id === 'string') {
    await removeRecordKey(log, row.key_id);
  }
}
