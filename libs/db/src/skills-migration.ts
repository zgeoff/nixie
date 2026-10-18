import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the skill tables: each skill version under its content hash, with its frontmatter and its
// files as text, and the skills each snapshot holds. A version stays once written, so a task pinned
// to an old version reads it after a seed moves the definitions on. Each step is safe to run again.
export const skillsMigration: Migration = {
  name: 'create the skill tables',
  up: async (tx) => {
    await sql`create table if not exists skill_versions (
      skill_hash text primary key,
      name text not null,
      frontmatter text not null check (json_valid(frontmatter)),
      files text not null check (json_valid(files))
    ) strict`.execute(tx);

    await sql`create table if not exists snapshot_skills (
      snapshot_hash text not null references definition_snapshots (snapshot_hash),
      name text not null,
      skill_hash text not null references skill_versions (skill_hash),
      origin text not null check (origin in ('definitions', 'vendored')),
      primary key (snapshot_hash, name)
    ) strict`.execute(tx);
  },
};
