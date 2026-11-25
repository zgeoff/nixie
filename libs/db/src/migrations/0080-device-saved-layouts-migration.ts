import { sql } from 'kysely';
import type { Migration } from '../types';

export const deviceSavedLayoutsMigration: Migration = {
  name: 'create the table that holds the layouts a device saved under a name, as sequences',
  up: async (tx) => {
    await sql`create table if not exists device_saved_layouts (
      saved_id text primary key,
      device_id text not null,
      name text not null,
      layout_sequence integer not null,
      regions text not null,
      saved_at integer not null,
      unique (device_id, name)
    ) strict`.execute(tx);
  },
};
