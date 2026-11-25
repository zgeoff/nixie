import type { ServiceContext } from '../service-context';
import type { ClientRow, ConnectionTables } from '../types';

export async function readClientByShortID(
  context: Pick<ServiceContext, 'log'>,
  shortID: string,
): Promise<ClientRow | null> {
  const row = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('oauth_clients')
    .selectAll()
    .where('short_id', '=', shortID)
    .where('removed_at', 'is', null)
    .executeTakeFirst();

  return row ?? null;
}
