import { sql } from 'kysely';
import type { Migration } from './types';

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
