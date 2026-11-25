import type { ServiceContext } from '../service-context';
import type { ClientRow, ConnectionTables } from '../types';

export async function readClientByID(
  context: Pick<ServiceContext, 'log'>,
  clientID: string,
): Promise<ClientRow | null> {
  const row = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('oauth_clients')
    .selectAll()
    .where('oauth_client_id', '=', clientID)
    .where('removed_at', 'is', null)
    .executeTakeFirst();

  return row ?? null;
}
