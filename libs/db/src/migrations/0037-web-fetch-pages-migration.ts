import { sql } from 'kysely';
import type { Migration } from '../types';

export const webFetchPagesMigration: Migration = {
  name: 'create the page store of the web fetch tool',
  up: async (tx) => {
    await sql`create table if not exists web_fetch_pages (
      session_key text not null,
      page_id text not null,
      thread text not null,
      url text not null,
      status integer not null,
      content_type text,
      is_truncated integer not null,
      blocked text,
      parts text not null,
      bytes integer not null,
      stored_at integer not null,
      primary key (session_key, page_id)
    ) strict`.execute(tx);

    await sql`create index if not exists web_fetch_pages_thread
      on web_fetch_pages (thread)`.execute(tx);
  },
};
