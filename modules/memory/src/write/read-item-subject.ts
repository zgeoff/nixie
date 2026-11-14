import type { MemorySubject, MemoryTables, StoreParts } from '../types';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { getRowSubject } from '../utils/get-row-subject';

// The subject of the item as it stands, whatever version the caller read.
export async function readItemSubject(parts: StoreParts, itemID: string): Promise<MemorySubject> {
  const item = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['kind', 'subject', 'state'])
    .where('item_id', '=', itemID)
    .executeTakeFirst();

  if (item === undefined || item.state === 'forgetting' || item.state === 'forgotten') {
    throw new MemoryItemNotFoundError(itemID);
  }

  return getRowSubject(item);
}
