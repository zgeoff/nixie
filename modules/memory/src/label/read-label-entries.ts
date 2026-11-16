import { readRecordKeys } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { Labels, MemoryTables, StoreParts } from '../types';
import { itemLabelsCodec } from './item-labels-codec';

// The row with the highest sequence of each active or retired item holds its labels.
export async function readLabelEntries(
  parts: Pick<StoreParts, 'context'>,
  db: Kysely<MemoryTables> = parts.context.log.writer.db.$extendTables<MemoryTables>(),
): Promise<ReadonlyMap<string, Labels>> {
  const rows = await db
    .selectFrom('memory_labels')
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_labels.item_id')
    .select(['memory_labels.item_id', 'memory_labels.revision', 'memory_labels.sealed'])
    .where('memory_items.state', 'in', ['active', 'retired'])
    .where('memory_labels.sequence', '=', (eb) =>
      eb
        .selectFrom('memory_labels as newest')
        .select((newest) => newest.fn.max('newest.sequence').as('sequence'))
        .whereRef('newest.item_id', '=', 'memory_labels.item_id'),
    )
    .execute();

  const keys = await readRecordKeys(
    parts.context.log,
    rows.map((row) => row.item_id),
  );

  const entries = new Map<string, Labels>();

  for (const row of rows) {
    const key = keys.get(row.item_id);

    if (key !== null && key !== undefined) {
      const labels = await itemLabelsCodec.decode(
        key,
        { itemID: row.item_id, revision: row.revision },
        row.sealed,
      );

      entries.set(row.item_id, labels);
    }
  }

  return entries;
}
