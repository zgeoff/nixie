import type { ServiceContext } from '../service-context';
import type { ClientRow, ConnectionTables } from '../types';

// The registered client of the connector that is not removed, or null for none.
export async function readLiveClient(
  context: Pick<ServiceContext, 'log' | 'connector'>,
): Promise<ClientRow | null> {
  const row = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('oauth_clients')
    .selectAll()
    .where('connector_id', '=', context.connector.id)
    .where('short_id', 'is not', null)
    .where('removed_at', 'is', null)
    .executeTakeFirst();

  return row ?? null;
}
