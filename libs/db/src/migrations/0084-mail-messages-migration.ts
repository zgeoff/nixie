import { sql } from 'kysely';
import type { Migration } from '../types';

export const mailMessagesMigration: Migration = {
  name: 'create the table of the assistant mail, one row for each mail it received or sent',
  up: async (tx) => {
    await sql`create table if not exists mail_messages (
      message_id text primary key,
      short_id text not null unique,
      thread_short_id text not null,
      host_message_id text not null unique,
      direction text not null,
      received_at integer not null,
      unread integer not null,
      header_hash text not null,
      record_sequence integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists mail_messages_by_header
      on mail_messages (header_hash)`.execute(tx);

    await sql`create index if not exists mail_messages_by_thread
      on mail_messages (thread_short_id)`.execute(tx);
  },
};
