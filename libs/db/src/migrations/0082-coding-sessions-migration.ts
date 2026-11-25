import { sql } from 'kysely';
import type { Migration } from '../types';

export const codingSessionsMigration: Migration = {
  name: 'create the tables of the coding sessions that tasks bind, of their short IDs and of the cursors that starts read',
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

    await sql`create table if not exists coding_start_cursors (
      adapter text not null,
      idempotency_key text not null,
      cursor text not null,
      written_at integer not null,
      primary key (adapter, idempotency_key)
    ) strict`.execute(tx);
  },
};
