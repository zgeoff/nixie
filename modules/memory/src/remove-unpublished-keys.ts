import { removeRecordKey } from '@heynixie/log';
import type { MemoryTables, StoreParts } from './types';

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

  await left.reduce(
    (removed, itemID) => removed.then(() => removeRecordKey(log, itemID)),
    Promise.resolve(),
  );
}
