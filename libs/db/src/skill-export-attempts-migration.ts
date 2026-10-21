import { sql } from 'kysely';
import type { Migration } from './types';

export const skillExportAttemptsMigration: Migration = {
  name: 'create the marks of skill exports in flight',
  up: async (tx) => {
    await sql`create table if not exists skill_export_attempts (
      approval_id text primary key references written_skills (approval_id),
      started_at integer not null
    ) strict`.execute(tx);
  },
};
