import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the skill tables: each skill version under its content hash, with its frontmatter and its
// files as text, and the skills each snapshot holds, marked when the conversation's list holds
// them. A version stays once written, so a task pinned to it reads it after a later seed.
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
      in_conversation integer not null check (in_conversation in (0, 1)),
      primary key (snapshot_hash, name)
    ) strict`.execute(tx);
  },
};
