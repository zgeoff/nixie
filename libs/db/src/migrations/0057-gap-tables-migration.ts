import { sql } from 'kysely';
import type { Migration } from '../types';

// The gap tables are projections that the log folds into rows, so a log that holds no such records
// leaves them empty.
export const gapTablesMigration: Migration = {
  name: 'add the gap tables',
  up: async (tx) => {
    await sql`create table if not exists gap_answers (
      proposal_id text primary key,
      group_hash text not null,
      answer text not null check (answer in ('approved', 'declined')),
      answered_at integer not null,
      answered_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists gap_answers_by_group
      on gap_answers (group_hash, answered_at)`.execute(tx);

    await sql`create table if not exists gap_groups (
      group_hash text primary key,
      quiet_until integer,
      proposal_id text,
      checked_sequence integer,
      lapsed_at integer
    ) strict`.execute(tx);

    await sql`create index if not exists gap_groups_by_proposal on gap_groups (proposal_id)`.execute(
      tx,
    );
  },
};
