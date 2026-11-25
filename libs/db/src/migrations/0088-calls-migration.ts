import { sql } from 'kysely';
import type { Migration } from '../types';

export const callsMigration: Migration = {
  name: 'create the table of voice calls',
  up: async (tx) => {
    await sql`create table if not exists calls (
      call_id text primary key,
      task_id text not null,
      state text not null,
      started_by text not null,
      carrying_session text not null,
      started_at integer not null,
      connected_at integer,
      ended_at integer,
      ended_by text,
      minutes integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists calls_by_state on calls (state)`.execute(tx);
  },
};
