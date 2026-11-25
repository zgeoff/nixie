import { withWriteTransaction } from '@heynixie/log';
import { readClientByID } from '../client/read-client-by-id';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables } from '../types';
import { readRowContext } from './read-connection-context';
import { readConnectionRowByID } from './read-connection-rows';

// Runs the connector's check of one live connection and keeps the scopes it found missing. A check
// that fails, such as a server error from Google, keeps what the last check found, and so does a
// check that began before a consent renewed the connection.
export async function runConnectionCheck(
  context: ServiceContext,
  connectionID: string,
): Promise<'checked' | 'failed' | 'skipped'> {
  const row = await readConnectionRowByID(context.log, connectionID);

  if (row?.binding !== 'enabled' || (await readClientByID(context, row.oauth_client_id)) === null) {
    return 'skipped';
  }

  const connectionContext = await readRowContext(context, row);

  if (connectionContext === null) {
    return 'skipped';
  }

  try {
    const report = await context.connector.check(
      { connectionID, connection: row.short_id },
      connectionContext,
    );

    await withWriteTransaction(context.log.writer, (tx) =>
      tx
        .$extendTables<ConnectionTables>()
        .updateTable('connections')
        .set({
          granted_scopes: JSON.stringify(report.grantedScopes),
          missing_scopes: JSON.stringify(report.missing),
        })
        .where('connection_id', '=', connectionID)
        .where('binding', '=', 'enabled')
        .where('removal_counter', '=', row.removal_counter)
        .execute(),
    );

    return 'checked';
  } catch {
    return 'failed';
  }
}

// The daily check of every live connection. One connection's failure never stops the others.
export async function runDailyChecks(context: ServiceContext): Promise<number> {
  const rows = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .select('connection_id')
    .where('binding', '=', 'enabled')
    .where('token_fingerprint', 'is not', null)
    .execute();

  let checked = 0;

  for (const row of rows) {
    if ((await runConnectionCheck(context, row.connection_id)) === 'checked') {
      checked += 1;
    }
  }

  return checked;
}
