import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';
import { ItemPurgingError } from '../utils/error/item-purging-error';

// A proposal for an item whose purge is unfinished would seal a value under a key that the purge
// is about to delete.
export async function requireItemNotPurging(db: Kysely<unknown>, itemID: string): Promise<void> {
  const row = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_evidence_purges')
    .select('item_id')
    .where('item_id', '=', itemID)
    .where('purged_sequence', 'is', null)
    .limit(1)
    .executeTakeFirst();

  if (row !== undefined) {
    throw new ItemPurgingError(itemID);
  }
}
