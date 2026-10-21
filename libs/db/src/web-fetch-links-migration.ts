import { sql } from 'kysely';
import type { Migration } from './types';

export const webFetchLinksMigration: Migration = {
  name: 'create the link store of the web fetch tool',
  up: async (tx) => {
    await sql`create table if not exists web_fetch_links (
      session_key text not null,
      number integer not null,
      url text not null,
      thread text not null,
      primary key (session_key, number),
      unique (session_key, url)
    ) strict`.execute(tx);

    await sql`create index if not exists web_fetch_links_thread
      on web_fetch_links (thread)`.execute(tx);
  },
};
