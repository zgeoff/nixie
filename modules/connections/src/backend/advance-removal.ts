import type { WriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';

// Begins the removal of a connection inside the caller's transaction: the counter advances and the
// binding turns to `removing`. The sealed values stay until the revocation has an outcome. Returns
// the new counter, or null for a credential that is no connection.
export async function advanceRemoval(
  tx: WriteTransaction,
  connectionID: string,
  nowMs: number,
): Promise<number | null> {
  const tables = tx.$extendTables<ConnectionTables>();

  const row = await tables
    .selectFrom('connections')
    .select(['removal_counter', 'binding'])
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const counter = row.removal_counter + 1;

  await tables
    .updateTable('connections')
    .set({
      removal_counter: counter,
      binding: row.binding === 'enabled' ? 'removing' : row.binding,
      status: 'forgotten',
      status_reason: null,
      status_since: nowMs,
      retry_at: null,
    })
    .where('connection_id', '=', connectionID)
    .execute();

  return counter;
}
