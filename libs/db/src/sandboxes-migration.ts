import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the sandboxes projection: one row per sandbox that nixie made and has not destroyed, with
// the adapter that made it and the owner that crash recovery reads.
export const sandboxesMigration: Migration = {
  name: 'create the sandboxes projection',
  up: async (tx) => {
    await sql`create table sandboxes (
      sandbox_id text primary key,
      adapter text not null,
      owner text not null,
      kind text not null,
      state text not null check (state in ('awake', 'sleeping')),
      spec text not null check (json_valid(spec)),
      created_sequence integer not null references records (sequence)
    ) strict`.execute(tx);
    await sql`create index sandboxes_by_owner on sandboxes (adapter, owner)`.execute(tx);
  },
};
