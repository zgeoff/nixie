import { sql } from 'kysely';
import type { Migration } from '../types';

export const devicesMigration: Migration = {
  name: 'create the devices table and give each session and code a scope',
  up: async (tx) => {
    for (const table of ['identities', 'enrolment_codes']) {
      const columns = await sql`
        select name from pragma_table_info(${table}) where name = 'scope'`.execute(tx);

      if (columns.rows.length === 0) {
        await sql`alter table ${sql.table(table)}
          add column scope text not null default 'full' check (scope in ('full', 'device'))`.execute(
          tx,
        );
      }
    }

    await sql`create table if not exists devices (
      device_id text primary key,
      identity_id text not null unique,
      name text not null,
      capabilities text not null,
      shown_sequence integer,
      idle_sequence integer,
      updated_at integer not null
    ) strict`.execute(tx);
  },
};
