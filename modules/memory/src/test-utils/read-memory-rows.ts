import type { Kysely } from 'kysely';
import type { MemoryItemRow, MemoryTables, MemoryVersionRow } from '../types';

export interface MemoryRows {
  readonly items: readonly MemoryItemRow[];
  readonly versions: readonly MemoryVersionRow[];
}

// Reads every row of both memory projections in key order, so two reads compare row for row.
export async function readMemoryRows(db: Kysely<MemoryTables>): Promise<MemoryRows> {
  const items = await db.selectFrom('memory_items').selectAll().orderBy('item_id').execute();

  const versions = await db
    .selectFrom('memory_versions')
    .selectAll()
    .orderBy('version_key')
    .execute();

  return { items, versions };
}
