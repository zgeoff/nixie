import type { Log, LogTables } from '../types';

const chunkSize = 500;

// The records, among these sequences, whose key an expiry named. A record whose key is gone and is
// not among them was forgotten.
export async function readExpiredSequences(
  log: Pick<Log, 'writer'>,
  sequences: readonly number[],
): Promise<ReadonlySet<number>> {
  const expired = new Set<number>();

  for (let start = 0; start < sequences.length; start += chunkSize) {
    const rows = await log.writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .innerJoin('expired_keys', 'expired_keys.key_id', 'records.key_id')
      .select('records.sequence')
      .where('records.sequence', 'in', sequences.slice(start, start + chunkSize))
      .execute();

    for (const row of rows) {
      expired.add(row.sequence);
    }
  }

  return expired;
}
