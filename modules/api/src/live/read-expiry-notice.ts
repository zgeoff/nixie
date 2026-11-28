import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { LogRecord, LogTables } from '@heynixie/log';
import { erasureFinishedCodec, erasureStartedCodec, readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import type { APIContext } from '../types';

type NoticeContext = Pick<APIContext, 'log'>;

// The notice that an expiry gives a thread on screen: the records of the thread whose payload it
// removes. A view that read a record after the start and before its key went follows the log from
// past the start, so the finish gives the notice again, for the records whose payload is gone.
export async function readExpiryNotice(
  context: NoticeContext,
  record: LogRecord,
  thread: string,
): Promise<ContractRecord | null> {
  if (record.kind === erasureStartedCodec.kind) {
    const started = erasureStartedCodec.decode(record.payload);

    if (started.kind !== 'expiry') {
      return null;
    }

    const named = await readThreadSequences(context, record.sequence, thread);

    return toNotice(record, thread, named);
  }

  if (record.kind !== erasureFinishedCodec.kind) {
    return null;
  }

  const finished = erasureFinishedCodec.decode(record.payload);

  if (finished.kind !== 'expiry') {
    return null;
  }

  const startedSequence = await readStartedSequence(context, finished.erasureID);

  if (startedSequence === null) {
    return null;
  }

  const sequences = await readThreadSequences(context, startedSequence, thread);
  const gone = await keepShredded(context, sequences);

  return toNotice(record, thread, gone);
}

// The records of the thread whose key the expiry that started at this sequence named.
async function readThreadSequences(
  context: NoticeContext,
  startedSequence: number,
  thread: string,
): Promise<readonly number[]> {
  const rows = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .innerJoin('expired_keys', 'expired_keys.key_id', 'records.key_id')
    .select('records.sequence')
    .where('records.thread', '=', thread)
    .where('expired_keys.started_sequence', '=', startedSequence)
    .orderBy('records.sequence')
    .execute();

  return rows.map((row) => row.sequence);
}

function toNotice(
  record: LogRecord,
  thread: string,
  sequences: readonly number[],
): ContractRecord | null {
  return sequences.length === 0
    ? null
    : {
        expiry: { sequences: [...sequences] },
        kind: record.kind,
        recordedAt: record.recordedAt,
        sequence: record.sequence,
        thread,
      };
}

async function readStartedSequence(
  context: NoticeContext,
  erasureID: string,
): Promise<number | null> {
  const row = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', sql.lit(erasureStartedCodec.kind))
    .where(sql`json_extract(payload, '$.erasureID')`, '=', erasureID)
    .executeTakeFirst();

  return row?.sequence ?? null;
}

const chunkSize = 500;

// A record whose key an expiry named can still read, because a kept moment needs the key.
async function keepShredded(
  context: NoticeContext,
  sequences: readonly number[],
): Promise<readonly number[]> {
  const shredded: number[] = [];

  for (let start = 0; start < sequences.length; start += chunkSize) {
    const chunk = sequences.slice(start, start + chunkSize);

    const read = await readRecords(context.log, {
      afterSequence: 0,
      limit: chunk.length,
      sequences: chunk,
    });

    for (const entry of read) {
      if (entry.record.erasable.status === 'shredded') {
        shredded.push(entry.record.sequence);
      }
    }
  }

  return shredded;
}
