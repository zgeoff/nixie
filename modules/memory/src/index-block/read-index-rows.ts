import type { MemorySubject, MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';

export interface IndexRow {
  readonly itemID: string;
  readonly shortID: string;
  readonly subject: MemorySubject;
  readonly topic: string;
  readonly gist: string;

  // the order of creation, so a higher number is a newer item
  readonly createdSequence: number;
}

export interface IndexRowOptions {
  readonly isPinnedIncluded: boolean;
}

// Every active item that has not lapsed, and is not pinned unless the options include pinned items,
// with its labels from the in-memory entries. It decrypts nothing, and the caller holds the store
// lock.
export async function readIndexRows(
  parts: StoreParts,
  options: IndexRowOptions,
): Promise<readonly IndexRow[]> {
  const now = parts.context.gate.clock.now();

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id', 'kind', 'subject', 'created_sequence'])
    .where('state', '=', 'active')
    .$if(!options.isPinnedIncluded, (query) => query.where('is_pinned', '=', 0))
    .where((row) => row.or([row('until', 'is', null), row('until', '>', now)]))
    .execute();

  return rows.flatMap((row) => {
    const labels = parts.labels.find(row.item_id);

    if (labels === undefined || row.short_id === null) {
      return [];
    }

    return [
      {
        itemID: row.item_id,
        shortID: row.short_id,
        subject: getRowSubject(row),
        topic: labels.topic,
        gist: labels.gist,
        createdSequence: row.created_sequence,
      },
    ];
  });
}
