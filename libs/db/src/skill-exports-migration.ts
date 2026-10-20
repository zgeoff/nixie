import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the export state of each skill that nixie wrote: the pull request on the definitions
// repo that carries it, and the base it was built on, so a changed base exports it again. It only
// adds a table, and running it again changes nothing.
export const skillExportsMigration: Migration = {
  name: 'create the export state of skills that nixie writes',
  up: async (tx) => {
    await sql`create table if not exists skill_exports (
      approval_id text primary key references written_skills (approval_id),
      state text not null check (state in ('opened', 'closed')),
      base_hash text,
      pull_request_number integer not null,
      pull_request_url text not null,
      updated_at integer not null
    ) strict`.execute(tx);
  },
};
