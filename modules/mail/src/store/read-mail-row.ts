import type { Log } from '@heynixie/log';
import type { MailTables } from '../types';

// The row of the stored mail that a short ID names, or null for an invented ID.
export async function readMailRow(
  log: Pick<Log, 'writer'>,
  shortID: string,
): Promise<MailTables['mail_messages'] | null> {
  const row = await log.writer.db
    .$extendTables<MailTables>()
    .selectFrom('mail_messages')
    .selectAll()
    .where('short_id', '=', shortID)
    .executeTakeFirst();

  return row ?? null;
}
