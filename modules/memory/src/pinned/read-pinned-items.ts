import type { Kysely } from 'kysely';
import { readDeliverableItems } from '../item/read-deliverable-items';
import type { MemoryTables, RecalledItem, StoreParts } from '../types';

export async function readPinnedItems(
  parts: StoreParts,
  db: Kysely<unknown> = parts.context.log.writer.db,
): Promise<readonly RecalledItem[]> {
  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('item_id')
    .where('is_pinned', '=', 1)
    .where('state', '=', 'active')
    .orderBy('pinned_sequence')
    .execute();

  return readDeliverableItems(parts, {
    itemIDs: rows.map((row) => row.item_id),
    states: ['active'],
    includeHistory: false,
    db,
  });
}
