import { removeRecordKey, writeKeyStoreCheckpoint } from '@heynixie/log';
import { readHeldRecordKeys } from './read-held-record-keys';
import type { MemoryTables, StoreParts } from './types';

export async function removeClosedProposalKeys(parts: StoreParts): Promise<number> {
  const log = parts.context.log;

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('item_id')
    .where('status', 'in', ['rejected', 'lapsed', 'consumed'])
    .where('is_new_item', '=', 1)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('memory_items')
            .select('item_id')
            .whereRef('memory_items.item_id', '=', 'memory_proposals.item_id'),
        ),
      ),
    )
    .execute();

  const left = await readHeldRecordKeys(log, [...new Set(rows.map((row) => row.item_id))]);

  await left.reduce(
    (removed, itemID) => removed.then(() => removeRecordKey(log, itemID)),
    Promise.resolve(),
  );

  if (rows.length > 0) {
    await writeKeyStoreCheckpoint(log, null);
  }

  return left.length;
}
