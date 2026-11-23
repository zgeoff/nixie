import { readRecords } from '@heynixie/log';
import type { MemoryTables, StoreParts } from '../types';

// The time each named item was first saved, by the record that created it. An item with no row has
// no entry.
export async function readSavedTimes(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (itemIDs.length === 0) {
    return new Map();
  }

  const rows = await parts.context.log.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'created_sequence'])
    .where('item_id', 'in', itemIDs)
    .execute();

  const entries = await readRecords(parts.context.log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.created_sequence),
    limit: Math.max(rows.length, 1),
  });

  const times = new Map(entries.map((entry) => [entry.record.sequence, entry.record.recordedAt]));

  return new Map(
    rows.flatMap((row) => {
      const savedAt = times.get(row.created_sequence);

      return savedAt === undefined ? [] : [[row.item_id, savedAt.getTime()] as const];
    }),
  );
}
