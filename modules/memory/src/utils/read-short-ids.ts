import type { MemoryTables, StoreParts } from '../types';
import { getItemShortID } from './item/get-item-short-id';

export async function readShortIDs(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (itemIDs.length === 0) {
    return new Map();
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id'])
    .where('item_id', 'in', itemIDs)
    .execute();

  return new Map(rows.map((row) => [row.item_id, getItemShortID(row)]));
}
