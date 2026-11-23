import type { MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import type { RetopicItem } from './types';

// Every active or retired item with its labels from the in-memory entries. The caller holds the
// store lock.
export async function readRetopicItems(
  parts: Pick<StoreParts, 'context' | 'labels'>,
): Promise<readonly RetopicItem[]> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id', 'kind', 'subject', 'is_pinned'])
    .where('state', 'in', ['active', 'retired'])
    .execute();

  return rows.flatMap((row) => {
    const labels = parts.labels.find(row.item_id);

    return labels === undefined || row.short_id === null
      ? []
      : [
          {
            itemID: row.item_id,
            shortID: row.short_id,
            subject: getRowSubject(row),
            isPinned: row.is_pinned === 1,
            labels,
          },
        ];
  });
}
