import type { Log, LogTables } from '@heynixie/log';

// The ID of the key that seals the record with this sequence, or null when it has none.
export async function readRecordKeyID(
  log: Pick<Log, 'writer'>,
  sequence: number,
): Promise<string | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  return row?.key_id ?? null;
}
