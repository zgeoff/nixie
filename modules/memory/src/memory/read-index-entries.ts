import type { MemoryContext, MemoryTables } from '../types';
import { readVersionValues } from '../version/read-version-values';
import type { IndexEntry } from './start-memory-index';

export async function readIndexEntries(context: MemoryContext): Promise<readonly IndexEntry[]> {
  const rows = await context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .innerJoin('memory_versions', (join) =>
      join
        .onRef('memory_versions.item_id', '=', 'memory_items.item_id')
        .onRef('memory_versions.version', '=', 'memory_items.version'),
    )
    .select([
      'memory_items.item_id',
      'memory_versions.version',
      'memory_versions.sequence',
      'memory_versions.sealed',
      'memory_versions.evidence',
      'memory_versions.intent_evidence',
    ])
    .where('memory_items.state', '=', 'active')
    .execute();

  const values = await readVersionValues(context.log, context.log.writer.db, rows);

  return rows.flatMap((row, index) => {
    const value = values[index];

    return value?.status === 'readable' ? [{ itemID: row.item_id, text: value.text.text }] : [];
  });
}
