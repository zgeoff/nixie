import { openConnectionValues } from '../connection/open-connection-values';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables } from '../types';
import type { KnownAccount } from './pick-consent-outcome';

// The accounts of each connection that a consent could match: the live ones, and the ones under
// Forget whose keys have not gone. nixie keeps no hash of an account, so it opens each one.
export async function readKnownAccounts(
  context: ServiceContext,
  excludedID: string,
): Promise<KnownAccount[]> {
  const rows = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .selectAll()
    .where('token_fingerprint', 'is not', null)
    .where('binding', 'in', ['enabled', 'removing'])
    .where('connection_id', '!=', excludedID)
    .execute();

  const opened = await openConnectionValues(context.log, rows);

  return rows.flatMap((row) => {
    const account = opened.get(row.connection_id)?.account ?? null;

    return account === null || (row.binding !== 'enabled' && row.binding !== 'removing')
      ? []
      : [{ connectionID: row.connection_id, subject: account.subject, binding: row.binding }];
  });
}

// The labels of the live connections, which a default label must not repeat.
export async function readLiveLabels(context: ServiceContext): Promise<string[]> {
  const rows = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .selectAll()
    .where('token_fingerprint', 'is not', null)
    .where('binding', '=', 'enabled')
    .execute();

  const opened = await openConnectionValues(context.log, rows);

  return [...opened.values()].flatMap((entry) => (entry.label === null ? [] : [entry.label]));
}
