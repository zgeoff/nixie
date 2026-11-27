import { sql } from 'kysely';
import type { Migration } from '../types';

export const connectionAddressesMigration: Migration = {
  name: "keep each address of a connection's account under its own reference",
  up: async (tx) => {
    await sql`create table if not exists connection_addresses (
      address_ref text primary key,
      connection_id text not null,
      account_sealed blob not null,
      created_at integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists connection_addresses_by_connection
      on connection_addresses (connection_id)`.execute(tx);
  },
};
