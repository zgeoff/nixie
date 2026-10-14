import type { Log } from '@heynixie/log';
import type { MemoryTables } from '../types';

// Reads the short ID that the items table holds for an item, and fails when the item or its short
// ID is missing, so a test compares what the model reads against the stored value.
export async function readItemShortID(log: Pick<Log, 'writer'>, itemID: string): Promise<string> {
  const row = await log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('short_id')
    .where('item_id', '=', itemID)
    .executeTakeFirstOrThrow();

  if (row.short_id === null) {
    throw new Error(`memory item ${itemID} holds no short ID`);
  }
  return row.short_id;
}
