import type { Kysely } from 'kysely';
import { readItemKeys } from '../item-key/read-item-keys';
import type { Labels, MemoryTables, StoreParts } from '../types';
import { itemLabelsCodec } from './item-labels-codec';

// The row with the highest sequence of each active or retired item holds its labels.
export async function readLabelEntries(
  parts: Pick<StoreParts, 'context'>,
  db: Kysely<unknown> = parts.context.log.writer.db,
): Promise<ReadonlyMap<string, Labels>> {
  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_labels')
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_labels.item_id')
    .select([
      'memory_labels.item_id',
      'memory_labels.revision',
      'memory_labels.sealed',
      'memory_labels.sequence',
    ])
    .where('memory_items.state', 'in', ['active', 'retired'])
    .where('memory_labels.sequence', '=', (eb) =>
      eb
        .selectFrom('memory_labels as newest')
        .select((newest) => newest.fn.max('newest.sequence').as('sequence'))
        .whereRef('newest.item_id', '=', 'memory_labels.item_id'),
    )
    .execute();

  const keys = await readItemKeys(
    parts.context.log,
    rows.map((row) => ({ value: 'labels', itemID: row.item_id, sequence: row.sequence })),
    db,
  );

  const entries = new Map<string, Labels>();

  for (const [index, row] of rows.entries()) {
    const opened = keys[index];

    if (opened?.status === 'readable') {
      const labels = await itemLabelsCodec.decode(
        opened.key,
        { itemID: row.item_id, revision: row.revision },
        row.sealed,
      );

      entries.set(row.item_id, labels);
    }
  }

  return entries;
}
