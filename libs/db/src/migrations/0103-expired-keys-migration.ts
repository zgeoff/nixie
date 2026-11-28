import { sql } from 'kysely';
import type { Migration } from '../types';

// An expiry is an erasure of its own kind, which the release before cannot read, so it must not
// open a database that holds one. The table answers which gone keys left by expiry.
export const expiredKeysMigration: Migration = {
  name: 'create the expired keys table and raise the oldest reader',
  up: async (tx) => {
    await sql`create table if not exists expired_keys (
      key_id text primary key,
      started_sequence integer not null references records (sequence)
    ) strict`.execute(tx);
  },
};
