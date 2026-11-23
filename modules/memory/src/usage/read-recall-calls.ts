import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import type { StoreParts } from '../types';
import type { RecallCallEntry } from './types';

const rowSchema = z.object({
  sequence: z.number(),
  thread: z.string().nullable(),
  end_sequence: z.number().nullable(),
});

// Every `memory.recall` call before the sequence, with where its span ends: its result, or else the
// next record on its thread that is no recalled record. Whether a call named items comes from its
// recorded input, which reads as `other` once a forget erased it.
export async function readRecallCalls(
  parts: StoreParts,
  beforeSequence: number,
): Promise<readonly RecallCallEntry[]> {
  const log = parts.context.log;

  const result = await sql`select called.sequence as sequence, called.thread as thread,
      coalesce(
        (select min(returned.sequence) from records as returned
          where returned.kind = 'tool_result' and returned.parent = called.sequence),
        (select min(next.sequence) from records as next
          where next.thread is called.thread
            and next.sequence > called.sequence
            and next.kind <> 'memory.recalled')
      ) as end_sequence
    from records as called
    where called.kind = 'tool_called'
      and called.sequence < ${beforeSequence}
      and json_extract(called.payload, '$.tool') = 'memory.recall'
    order by called.sequence`.execute(log.writer.db);

  const rows = z.array(rowSchema).parse(result.rows);

  const kinds = await readCallKinds(parts, rows);

  return rows.map((row) => ({
    sequence: row.sequence,
    thread: row.thread,
    endSequence: row.end_sequence,
    kind: kinds.get(row.sequence) ?? 'other',
  }));
}

const pageSize = 200;

async function readCallKinds(
  parts: StoreParts,
  rows: readonly z.infer<typeof rowSchema>[],
): Promise<ReadonlyMap<number, RecallCallEntry['kind']>> {
  const kinds = new Map<number, RecallCallEntry['kind']>();

  for (let start = 0; start < rows.length; start += pageSize) {
    const sequences = rows.slice(start, start + pageSize).map((row) => row.sequence);

    const entries = await readRecords(parts.context.log, {
      afterSequence: 0,
      sequences,
      limit: pageSize,
    });

    for (const entry of entries) {
      kinds.set(entry.record.sequence, pickCallKind(entry.record.erasable));
    }
  }

  return kinds;
}

const inputSchema = z.object({ itemIDs: z.unknown().optional() });

function pickCallKind(erasable: LogRecord['erasable']): RecallCallEntry['kind'] {
  if (erasable.status !== 'readable') {
    return 'other';
  }

  const fields = z.object({ input: inputSchema }).safeParse(erasable.fields);

  if (!fields.success) {
    return 'other';
  }

  return fields.data.input.itemIDs === undefined ? 'other' : 'ids';
}
