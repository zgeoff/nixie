import type { MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { getItemShortID } from '../utils/item/get-item-short-id';
import type { RetopicItem } from './types';

// Every active or retired item with its labels from the in-memory entries. The caller holds the
// store lock.
export async function readRetopicItems(
  parts: Pick<StoreParts, 'context' | 'labels'>,
): Promise<readonly RetopicItem[]> {
  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id', 'kind', 'subject', 'is_pinned', 'state'])
    .where('state', 'in', ['active', 'retired'])
    .execute();

  return rows.flatMap((row) => {
    const labels = parts.labels.find(row.item_id);

    return labels === undefined
      ? []
      : [
          {
            itemID: row.item_id,
            shortID: getItemShortID(row),
            state: row.state === 'retired' ? 'retired' : 'active',
            subject: getRowSubject(row),
            isPinned: row.is_pinned === 1,
            labels,
          },
        ];
  });
}
