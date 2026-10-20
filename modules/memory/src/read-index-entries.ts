import { readRecordKeys } from '@heynixie/log';
import { decodeVersionText } from './decode-version-text';
import type { IndexEntry } from './start-memory-index';
import type { MemoryContext, MemoryTables } from './types';

// Reads the current text of every active item for the index. An item whose key fails stays out of
// the index, and recall leaves it out too.
export async function readIndexEntries(context: MemoryContext): Promise<readonly IndexEntry[]> {
  const rows = await context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .innerJoin('memory_versions', (join) =>
      join
        .onRef('memory_versions.item_id', '=', 'memory_items.item_id')
        .onRef('memory_versions.version', '=', 'memory_items.version'),
    )
    .select(['memory_items.item_id', 'memory_items.version', 'memory_versions.sealed'])
    .where('memory_items.state', '=', 'active')
    .execute();

  const keys = await readRecordKeys(
    context.log,
    rows.map((row) => row.item_id),
  );

  const entries = await Promise.all(
    rows.map(async (row) => {
      const key = keys.get(row.item_id);

      if (key === undefined || key === null) {
        return null;
      }

      try {
        const text = await decodeVersionText(
          key,
          { itemID: row.item_id, version: row.version },
          row.sealed,
        );

        return { itemID: row.item_id, text: text.text };
      } catch {
        return null;
      }
    }),
  );

  return entries.filter((entry) => entry !== null);
}
