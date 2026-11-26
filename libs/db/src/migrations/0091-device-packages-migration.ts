import { sql } from 'kysely';
import type { Migration } from '../types';

export const devicePackagesMigration: Migration = {
  name: 'create the table that holds the npm packages the owner approved for device pages',
  up: async (tx) => {
    await sql`create table if not exists device_packages (
      package_id text primary key,
      name text not null,
      version text not null,
      integrity text not null,
      unpacked_bytes integer not null,
      publisher text not null,
      files text not null,
      added_sequence integer not null,
      unique (name, version)
    ) strict`.execute(tx);
  },
};
