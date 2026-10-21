import type { CheckedTables } from '@heynixie/db';

// One link target a session's fetched pages showed, under the number the session gave it.
interface WebFetchLinkRow {
  readonly session_key: string;
  readonly number: number;
  readonly url: string;

  // the thread whose forget removes the row
  readonly thread: string;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type WebFetchTables = CheckedTables<Readonly<{ web_fetch_links: WebFetchLinkRow }>>;
