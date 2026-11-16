import type { Kysely } from 'kysely';
import { readRemovedSequences } from '../record/read-removed-sequences';
import { QuotedRecordForgettingError } from '../utils/error/quoted-record-forgetting-error';

// A record forget refuses every write that quotes the record from the forget's first transaction.
// The check runs inside the write's own transaction, so a write that found its quote before the
// forget began fails the same way.
export async function requireUnforgottenQuote(
  db: Kysely<unknown>,
  recordSequence: number,
): Promise<void> {
  const removed = await readRemovedSequences(db, [recordSequence]);

  if (removed.has(recordSequence)) {
    throw new QuotedRecordForgettingError(recordSequence);
  }
}
