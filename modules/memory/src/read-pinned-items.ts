import type { Kysely } from 'kysely';
import { readDeliverableItems } from './read-deliverable-items';
import type { MemoryTables, RecalledItem, StoreParts } from './types';

// Reads the current text of every pinned active item, in the order you pinned them, through the
// caller's connection or the writer's. The caller holds the delivery lock.
export async function readPinnedItems(
  parts: StoreParts,
  db: Kysely<MemoryTables> = parts.context.log.writer.db.$extendTables<MemoryTables>(),
): Promise<readonly RecalledItem[]> {
  const rows = await db
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
