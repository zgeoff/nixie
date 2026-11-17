import { sql } from 'kysely';
import type { Migration } from '../types';

// The turn count has one row per 15-minute bucket, so a count of a day or a month in any zone sums
// whole buckets. The migration only adds tables, so the release before still opens the database;
// the server folds the turns that no fold has counted at each start, which spend_turns_folded tracks.
export const spendStopMigration: Migration = {
  name: 'add the spending stop tables',
  up: async (tx) => {
    await sql`create table if not exists spend_stop (
      id integer primary key check (id = 1),
      reason text not null,
      period text,
      measure text,
      limit_amount real,
      spent_amount real,
      at integer not null,
      resets_at integer,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_raises (
      start text primary key,
      dollars real not null,
      tokens integer not null,
      turns integer not null,
      raised_by text not null,
      at integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_turns (
      bucket_start integer primary key,
      turns integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists spend_turns_folded (
      id integer primary key check (id = 1),
      through_sequence integer not null
    ) strict`.execute(tx);
  },
};
