import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the web fetch tool's link store: each link target a session's fetched pages showed, under
// the number the session gave it, with the thread a forget clears it by. It only adds a table and
// its index, and running it again changes nothing.
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
