import type { Log, LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import { sql } from 'kysely';

export async function removeImageOfferKeys(
  log: Pick<Log, 'writer'>,
  messageSequence: number,
): Promise<void> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('kind', '=', 'memory.image_offered')
    .where(sql`json_extract(payload, '$.messageSequence')`, '=', messageSequence)
    .where('key_id', 'is not', null)
    .execute();

  for (const row of rows) {
    if (row.key_id !== null) {
      await removeRecordKey(log, row.key_id);
    }
  }
}
