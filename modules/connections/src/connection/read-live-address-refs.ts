import type { WriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import type { ConnectionTables } from '../types';

// The reference of the newest address of each live connection, in the order the connections were
// made, read in the caller's transaction. A connection that has kept no address takes its own ID.
// A forgotten connection, and a consent that has not finished, is not live.
export async function readLiveAddressRefs(tx: WriteTransaction): Promise<readonly string[]> {
  const tables = tx.$extendTables<ConnectionTables>();

  const rows = await tables
    .selectFrom('connections')
    .select('connection_id')
    .where('binding', '=', 'enabled')
    .where('token_fingerprint', 'is not', null)
    .orderBy('created_at')
    .execute();

  const refs: string[] = [];

  for (const row of rows) {
    const newest = await tables
      .selectFrom('connection_addresses')
      .select('address_ref')
      .where('connection_id', '=', row.connection_id)
      .orderBy(sql`rowid`, 'desc')
      .executeTakeFirst();

    refs.push(newest?.address_ref ?? row.connection_id);
  }

  return refs;
}
