import { sql } from 'kysely';
import type { Migration } from '../types';

export const deviceLayoutsMigration: Migration = {
  name: 'create the tables that point each device at its layout and the content of its regions',
  up: async (tx) => {
    await sql`create table if not exists device_layouts (
      device_id text primary key,
      layout_sequence integer not null,
      updated_at integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists device_regions (
      device_id text not null,
      region text not null,
      shown_sequence integer not null,
      primary key (device_id, region)
    ) strict`.execute(tx);
  },
};
