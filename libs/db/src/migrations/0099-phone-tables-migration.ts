import { sql } from 'kysely';
import type { Migration } from '../types';

export const phoneTablesMigration: Migration = {
  name: 'create the tables of the assistant phone: its stored texts and the sends that settled on a message',
  up: async (tx) => {
    await sql`create table if not exists phone_texts (
      text_id text primary key,
      short_id text not null unique,
      message_id text not null unique,
      received_at integer not null,
      record_sequence integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists phone_texts_by_received
      on phone_texts (received_at, record_sequence)`.execute(tx);

    await sql`create table if not exists phone_send_claims (
      action_id text primary key,
      message_id text not null unique,
      short_id text not null unique,
      updated_sequence integer not null
    ) strict`.execute(tx);
  },
};
