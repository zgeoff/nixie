import type { WriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';

// Whether the connection is live in the caller's write transaction: not forgotten, and no forget
// begun. A forget turns the binding in its own start transaction, so a writer that checks here sees
// the forget once it has committed, and a writer that commits first is cleaned up by it.
export async function probeConnectionEnabled(
  tx: WriteTransaction,
  connectionID: string,
): Promise<boolean> {
  const row = await tx
    .$extendTables<ConnectionTables>()
    .selectFrom('connections')
    .select('binding')
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  return row?.binding === 'enabled';
}
