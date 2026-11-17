import { sql } from 'kysely';
import type { Migration } from '../types';

// The turn count has one row per 15-minute bucket, so a count of a day or a month in any zone sums
// whole buckets. It starts from the turn records the log holds, so an upgrade mid-period keeps the
// count.
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

    await sql`insert into spend_turns (bucket_start, turns)
      select recorded_at / 900000 * 900000, count(*)
      from records
      where kind in ('model.turn_ended', 'worker.turn_ended')
      group by recorded_at / 900000 * 900000`.execute(tx);
  },
};
