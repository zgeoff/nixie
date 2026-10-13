import type { Kysely } from 'kysely';
import type { MemoryTables } from './types';

// Which of the records backed an item that was forgotten since. Such a record never backs a write
// again, so a forget never returns through a fresh quote of the same words.
export async function readForgottenSequences(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<ReadonlySet<number>> {
  if (sequences.length === 0) {
    return new Set();
  }
  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_forgotten_evidence')
    .select('record_sequence')
    .where('record_sequence', 'in', sequences)
    .execute();

  return new Set(rows.map((row) => row.record_sequence));
}
