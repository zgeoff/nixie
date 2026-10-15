import { removeRecordKey } from '@heynixie/log';
import type { MemoryTables, StoreParts } from './types';

// Removes the key a writer batch created for each new item's proposal that never published, such
// as one in a batch that split or failed. A key whose proposal published stays, because the
// proposal's text is sealed under it.
export async function removeUnpublishedKeys(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<void> {
  if (itemIDs.length === 0) {
    return;
  }

  const log = parts.context.log;

  const rows = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('item_id')
    .where('item_id', 'in', itemIDs)
    .execute();

  const published = new Set(rows.map((row) => row.item_id));

  const left = itemIDs.filter((itemID) => !published.has(itemID));

  // one key removal at a time, because each checkpoints the key store
  await left.reduce(
    (removed, itemID) => removed.then(() => removeRecordKey(log, itemID)),
    Promise.resolve(),
  );
}
