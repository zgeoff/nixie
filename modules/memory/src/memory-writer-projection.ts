import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { WriterRecord } from './parse-writer-record';
import { parseWriterRecord } from './parse-writer-record';
import type { WriterTables } from './writer-types';

export const memoryWriterProjection: Projection = {
  table: 'memory_writer',
  keyColumn: 'writer_id',
  fold: async (tx, record) => {
    const parsed = parseWriterRecord(record);

    if (parsed === null) {
      return [];
    }

    await applyWriterRecord(tx.$extendTables<WriterTables>(), parsed, record);

    return [memoryWriterTaskID];
  },
};

async function applyWriterRecord(
  db: Transaction<WriterTables>,
  parsed: WriterRecord,
  record: EnvelopeRecord,
): Promise<void> {
  if (parsed.kind === 'memory.writer_started') {
    await db
      .insertInto('memory_writer')
      .values({
        writer_id: memoryWriterTaskID,
        cursor: 0,
        start_sequence: parsed.startSequence,
        caught_up_sequence: null,
        catch_up_applied: 0,
        pending_start: null,
        pending_end: null,
        batches: 0,
        last_batch_at: null,
        failures: 0,
        retry_at: null,
        last_error_code: null,
        last_error_sequence: null,
        last_error_at: null,
        updated_sequence: record.sequence,
      })
      .execute();

    return;
  }

  const row = await db
    .selectFrom('memory_writer')
    .select(['catch_up_applied', 'batches'])
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirstOrThrow();

  await db
    .updateTable('memory_writer')
    .set({ updated_sequence: record.sequence, ...buildWriterUpdate(parsed, record, row) })
    .where('writer_id', '=', memoryWriterTaskID)
    .execute();
}

interface CountColumns {
  readonly catch_up_applied: number;
  readonly batches: number;
}

function buildWriterUpdate(
  parsed: Exclude<WriterRecord, { readonly kind: 'memory.writer_started' }>,
  record: EnvelopeRecord,
  row: CountColumns,
) {
  if (parsed.kind === 'memory.batch_planned') {
    return { pending_start: parsed.start, pending_end: parsed.end };
  }

  if (parsed.kind === 'memory.batch_published') {
    return {
      cursor: parsed.end,
      pending_start: null,
      pending_end: null,
      batches: row.batches + 1,
      last_batch_at: parsed.at,
      failures: 0,
      retry_at: null,
      catch_up_applied:
        parsed.mode === 'catch_up'
          ? row.catch_up_applied + parsed.applied.length
          : row.catch_up_applied,
      ...(parsed.catchUpEnded ? { caught_up_sequence: record.sequence } : {}),
    };
  }

  return {
    failures: parsed.failures,
    retry_at: parsed.retryAt,
    last_error_code: parsed.code,
    last_error_sequence: record.sequence,
    last_error_at: parsed.at,
  };
}
