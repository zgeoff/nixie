import { findRecordKeys, removeRecordKey, writeKeyStoreCheckpoint } from '@heynixie/log';
import type { MemoryTables, StoreParts } from './types';

// Removes each key that a closed new item's proposal left with no item under it, rejected, lapsed or
// approved as a revision of another item, which a crash after the close leaves behind. Store start
// and each lapse sweep run it. It returns how many keys it removed.
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
  const left = await findLeftKeys(parts, [...new Set(rows.map((row) => row.item_id))]);

  // one key removal at a time, because each checkpoints the key store
  await left.reduce(
    (removed, itemID) => removed.then(() => removeRecordKey(log, itemID)),
    Promise.resolve(),
  );

  // a removal whose checkpoint a reader blocked left no row to find, so the checkpoint runs again
  if (rows.length > 0) {
    await writeKeyStoreCheckpoint(log, null);
  }
  return left.length;
}

const chunkSize = 500;

// the IDs whose key the key store still holds, looked up a chunk at a time to stay inside the
// statement's parameter limit
async function findLeftKeys(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<readonly string[]> {
  const chunks = Array.from({ length: Math.ceil(itemIDs.length / chunkSize) }, (_, index) =>
    itemIDs.slice(index * chunkSize, (index + 1) * chunkSize),
  );
  const found = await Promise.all(chunks.map((chunk) => findRecordKeys(parts.context.log, chunk)));

  return found.flatMap((keys) => keys.keys().toArray());
}
