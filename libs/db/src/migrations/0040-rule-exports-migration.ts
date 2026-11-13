import { sql } from 'kysely';
import type { Migration } from '../types';

export const ruleExportsMigration: Migration = {
  name: 'create the rule exports',
  up: async (tx) => {
    await sql`create table if not exists rule_exports (
      export_id text primary key,
      state text check (state in ('opened', 'closed')),
      pull_request_number integer,
      pull_request_url text,
      attempt_started_at integer,
      updated_at integer not null
    ) strict`.execute(tx);
  },
};
