import { buildShortIDFromUUID } from '@heynixie/db';
import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { MemoryRecord } from './parse-memory-record';
import { parseMemoryRecord } from './parse-memory-record';
import { parseSensitiveRecord } from './parse-sensitive-record';
import { parseSubjectRecord } from './parse-subject-record';
import type { MemoryTables } from './types';

export const memoryItemsProjection: Projection = {
  table: 'memory_items',
  keyColumn: 'item_id',
  fold: async (tx, record) => {
    const marked = parseSubjectRecord(record);

    if (marked?.target === 'item') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_items')
        .set({ subject: marked.subject, kind: marked.subject === 'self' ? 'self' : 'fact' })
        .where('item_id', '=', marked.itemID)
        .execute();

      return [marked.itemID];
    }

    const sensitive = parseSensitiveRecord(record);

    if (sensitive?.target === 'item') {
      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_items')
        .set({ is_sensitive: sensitive.isSensitive ? 1 : 0 })
        .where('item_id', '=', sensitive.itemID)
        .execute();

      return [sensitive.itemID];
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

        short_id: parsed.shortID ?? buildShortIDFromUUID(parsed.itemID),
        kind: 'fact',
        subject: 'owner',
        until: parsed.until,
        is_sensitive: 0,
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
  if (parsed.kind === 'memory.version_added') {
    const version = { version: parsed.version, state: parsed.state, until: parsed.until };

    return parsed.state === 'retired'
      ? { ...version, is_pinned: 0, pinned_sequence: null }
      : version;
  }

  if (parsed.kind === 'memory.pinned') {
    return {
      is_pinned: parsed.isPinned ? 1 : 0,
      pinned_sequence: parsed.isPinned ? sequence : null,
    };
  }

  if (parsed.kind === 'memory.forget_started') {
    return { state: 'forgetting' as const, is_pinned: 0, pinned_sequence: null, until: null };
  }

  return { state: 'forgotten' as const, forgotten_sequence: sequence };
}
