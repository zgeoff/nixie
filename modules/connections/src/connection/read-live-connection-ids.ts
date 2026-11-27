import type { WriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';

// The ID of each live connection, in the order the connections were made, read in the caller's
// transaction. A forgotten connection, and a consent that has not finished, is not live. An ID holds
// no account, so a caller keeps it where an address must stay out.
export async function readLiveConnectionIDs(tx: WriteTransaction): Promise<readonly string[]> {
  const rows = await tx
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .select('connection_id')
    .where('binding', '=', 'enabled')
    .where('token_fingerprint', 'is not', null)
    .orderBy('created_at')
    .execute();

  return rows.map((row) => row.connection_id);
}
