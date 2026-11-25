import { sql } from 'kysely';
import type { Migration } from '../types';

export const codingSessionsMigration: Migration = {
  name: 'create the tables of the coding sessions that tasks bind and of their short IDs',
  up: async (tx) => {
    await sql`create table if not exists coding_sessions (
      task_id text primary key,
      adapter text not null,
      session_id text not null,
      origin text not null,
      state text not null,
      wake text not null,
      hop integer not null,
      from_cursor text not null,
      last_event_at integer,
      unbound_at integer,
      updated_sequence integer not null,
      held_answers text not null
    ) strict`.execute(tx);

    await sql`create index if not exists coding_sessions_by_session
      on coding_sessions (adapter, session_id)`.execute(tx);

    await sql`create table if not exists coding_session_ids (
      short_id text primary key,
      adapter text not null,
      session_id text not null,
      named_sequence integer not null,
      unique (adapter, session_id)
    ) strict`.execute(tx);
  },
};
