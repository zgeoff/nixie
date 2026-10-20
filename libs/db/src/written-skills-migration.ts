import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the store of skills that nixie writes, one row per approval, and marks each snapshot
// skill with the approval that applied it. The new column is nullable, so the release before still
// inserts rows. Each step is safe to run again.
export const writtenSkillsMigration: Migration = {
  name: 'create the store of skills that nixie writes',
  up: async (tx) => {
    await sql`create table if not exists written_skills (
      approval_id text primary key,
      proposal_id text not null unique,
      name text not null,
      skill_hash text not null references skill_versions (skill_hash),
      state text not null check (state in ('in_force', 'adopted', 'superseded', 'retired')),
      base_hash text,
      base_origin text check (base_origin in ('definitions', 'vendored')),
      definitions_hash text,
      definitions_origin text check (definitions_origin in ('definitions', 'vendored')),
      approved_at integer not null,
      updated_at integer not null
    ) strict`.execute(tx);

    // a skill has at most one version in force that nixie wrote
    await sql`create unique index if not exists written_skills_in_force
      on written_skills (name) where state = 'in_force'`.execute(tx);

    const columns = await sql<{ name: string }>`
      select name from pragma_table_info('snapshot_skills') where name = 'approval_id'`.execute(tx);

    if (columns.rows.length === 0) {
      await sql`alter table snapshot_skills add column approval_id text`.execute(tx);
    }
  },
};
