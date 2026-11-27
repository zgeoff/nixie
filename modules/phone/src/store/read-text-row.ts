import type { Log } from '@heynixie/log';
import type { PhoneTables } from '../types';

// The row of the stored text that a short ID names, or null for an invented ID.
export async function readTextRow(
  log: Pick<Log, 'writer'>,
  shortID: string,
): Promise<PhoneTables['phone_texts'] | null> {
  const row = await log.writer.db
    .$extendTables<PhoneTables>()
    .selectFrom('phone_texts')
    .selectAll()
    .where('short_id', '=', shortID)
    .executeTakeFirst();

  return row ?? null;
}
