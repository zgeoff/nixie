import type { Log, LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';

// What a forget does to a record's text: the key goes, and the record stays.
export async function removeTestRecordKey(log: Log, sequence: number): Promise<void> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  if (row?.key_id !== null && row?.key_id !== undefined) {
    await removeRecordKey(log, row.key_id);
  }
}
