import { writeRecords } from '@heynixie/log';
import { clientRemovedCodec } from '../record/client-removed-codec';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables, RemoveClientResult } from '../types';
import { readClientByShortID } from './read-client-by-short-id';

// Removes the client: its secret and its key go. Google keeps the client until the owner deletes it
// in the console, so nothing is revoked. A client that a connection that is not forgotten uses, or
// a consent request that has not lapsed names, stays, so no token exchange runs on a removed client.
export function removeClient(
  context: ServiceContext,
  shortID: string,
): Promise<RemoveClientResult> {
  return context.lock.withLock(async () => {
    const client = await readClientByShortID(context, shortID);

    if (client === null) {
      return { kind: 'client_not_found' };
    }

    const tables = context.log.writer.db.$extendTables<ConnectionTables>();

    const connection = await tables
      .selectFrom('connections')
      .select('connection_id')
      .where('oauth_client_id', '=', client.oauth_client_id)
      .where('binding', '!=', 'removed')
      .executeTakeFirst();

    const consent = await tables
      .selectFrom('consent_requests')
      .select('consent_id')
      .where('oauth_client_id', '=', client.oauth_client_id)
      .where('expires_at', '>', context.now())
      .executeTakeFirst();

    if (connection !== undefined || consent !== undefined) {
      return { kind: 'client_in_use' };
    }

    await context.store.remove({ backend: 'database', credentialID: client.oauth_client_id });

    await writeRecords(context.log, [
      {
        kind: clientRemovedCodec.kind,
        definitions: context.definitions(),
        payload: clientRemovedCodec.encode({ client: shortID }),
      },
    ]);

    return { kind: 'ok' };
  });
}
