import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { SharedProposal } from '@heynixie/proposals';
import type { Kysely } from 'kysely';

// The records that created the rows, by sequence.
export async function readProposalRecords(
  log: Log,
  db: Kysely<unknown>,
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (rows.length === 0) {
    return new Map();
  }

  const read = await readRecords(
    { ...log, writer: { ...log.writer, db } },
    { afterSequence: 0, sequences: rows.map((row) => row.createdSequence), limit: rows.length },
  );

  return new Map(read.map((entry) => [entry.record.sequence, entry.record]));
}
