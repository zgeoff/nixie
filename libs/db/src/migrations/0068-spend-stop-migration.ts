import { sql } from 'kysely';
import type { Migration } from '../types';

// The spend tables are projections that the log folds into rows, so a log that holds no spend
// records leaves them empty. The turn count has one row per 15-minute bucket, so a count of a day
// or a month in any zone sums whole buckets.
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
  },
};
