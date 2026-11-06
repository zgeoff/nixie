import type { Writer } from '@heynixie/log';
import type { MemoryState, MemoryTables } from '../types';

export interface TestMemoryItem {
  readonly itemID: string;
  readonly version: number;
  readonly state: MemoryState;
}

export async function readTestMemoryItems(
  writer: Pick<Writer, 'db'>,
): Promise<readonly TestMemoryItem[]> {
  const rows = await writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'version', 'state'])
    .orderBy('created_sequence')
    .execute();

  return rows.map((row) => ({ itemID: row.item_id, version: row.version, state: row.state }));
}
