import type { Log, LogTables } from '../types';

// The key ID of each of these records that has one, by sequence.
export async function readRecordKeyIDs(
  log: Pick<Log, 'writer'>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, string>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(['sequence', 'key_id'])
    .where('sequence', 'in', sequences)
    .where('key_id', 'is not', null)
    .execute();

  return new Map(
    rows.flatMap((row) => (row.key_id === null ? [] : [[row.sequence, row.key_id] as const])),
  );
}
