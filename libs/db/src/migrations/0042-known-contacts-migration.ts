import { sql } from 'kysely';
import type { Migration } from '../types';

export const knownContactsMigration: Migration = {
  name: 'create the known contacts',
  up: async (tx) => {
    await sql`create table if not exists known_contacts (
      contact_id text primary key,
      marked_sequence integer not null,
      unmarked_sequence integer
    ) strict`.execute(tx);
  },
};
