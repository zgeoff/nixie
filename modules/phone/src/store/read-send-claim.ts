import type { Log } from '@heynixie/log';
import type { PhoneTables } from '../types';

// The short ID of the text that a send settled on, or null while it has settled on none.
export async function readSendClaim(
  log: Pick<Log, 'writer'>,
  actionID: string,
): Promise<string | null> {
  const claim = await log.writer.db
    .$extendTables<PhoneTables>()
    .selectFrom('phone_send_claims')
    .select('short_id')
    .where('action_id', '=', actionID)
    .executeTakeFirst();

  return claim?.short_id ?? null;
}
