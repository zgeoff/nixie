import { buildShortIDFromUUID } from '@heynixie/db';
import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { parseKindRecord } from './parse-kind-record';
import type { MemoryRecord } from './parse-memory-record';
import { parseMemoryRecord } from './parse-memory-record';
import type { MemoryTables } from './types';

// One row per memory item: its current version, its state and its pin. The row is a projection of
// the item's records, so a rebuild from the log gives the live rows.
export const memoryItemsProjection: Projection = {
  table: 'memory_items',
  keyColumn: 'item_id',
  fold: async (tx, record) => {
    const marked = parseKindRecord(record);

    // a self-note's mark follows its created version, and changes only the item's kind
    if (marked?.kind === 'memory.self_noted') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_items')
        .set({ kind: 'self' })
        .where('item_id', '=', marked.itemID)
        .execute();

      return [marked.itemID];
    }

    const parsed = parseMemoryRecord(record);

    if (parsed === null) {
      return [];
    }

    await applyMemoryRecord(tx.$extendTables<MemoryTables>(), parsed, record);

    return [parsed.itemID];
  },
};

async function applyMemoryRecord(
  db: Transaction<MemoryTables>,
  parsed: MemoryRecord,
  record: EnvelopeRecord,
): Promise<void> {
  if (parsed.kind === 'memory.version_added' && parsed.change === 'created') {
    await db
      .insertInto('memory_items')
      .values({
        item_id: parsed.itemID,
        version: parsed.version,
        state: parsed.state,
        is_pinned: 0,
        pinned_sequence: null,
        created_sequence: record.sequence,
        updated_sequence: record.sequence,
        forgotten_sequence: null,

        // an item from before short IDs takes the one its UUID gives, as the backfill gave it
        short_id: parsed.shortID ?? buildShortIDFromUUID(parsed.itemID),
        kind: 'fact',
      })
      .execute();

    return;
  }

  await db
    .updateTable('memory_items')
    .set({ updated_sequence: record.sequence, ...buildItemUpdate(parsed, record.sequence) })
    .where('item_id', '=', parsed.itemID)
    .execute();
}

function buildItemUpdate(parsed: MemoryRecord, sequence: number) {
  // a retired item leaves the pinned core, and a restore does not put it back
  if (parsed.kind === 'memory.version_added') {
    return parsed.state === 'retired'
      ? { version: parsed.version, state: parsed.state, is_pinned: 0, pinned_sequence: null }
      : { version: parsed.version, state: parsed.state };
  }

  if (parsed.kind === 'memory.pinned') {
    return {
      is_pinned: parsed.isPinned ? 1 : 0,
      pinned_sequence: parsed.isPinned ? sequence : null,
    };
  }

  if (parsed.kind === 'memory.forget_started') {
    return { state: 'forgetting' as const, is_pinned: 0, pinned_sequence: null };
  }

  return { state: 'forgotten' as const, forgotten_sequence: sequence };
}
