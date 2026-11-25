import type { Log } from '@heynixie/log';
import type { ConnectionTables } from '../types';

// The ID of the OAuth client that issued a connection's token, or null for no such connection.
export async function readConnectionOwner(
  log: Pick<Log, 'writer'>,
  connectionID: string,
): Promise<string | null> {
  const row = await log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .select('oauth_client_id')
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  return row?.oauth_client_id ?? null;
}
