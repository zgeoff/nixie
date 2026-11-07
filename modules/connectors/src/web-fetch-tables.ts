import type { CheckedTables } from '@heynixie/db';

// One link target a session's fetched pages showed, under the number the session gave it.
interface WebFetchLinkRow {
  readonly session_key: string;
  readonly number: number;
  readonly url: string;

  // the thread whose forget removes the row
  readonly thread: string;
}

// One page a session fetched, cut into the parts the model reads it by.
interface WebFetchPageRow {
  readonly session_key: string;
  readonly page_id: string;
  readonly thread: string;
  readonly url: string;
  readonly status: number;
  readonly content_type: string | null;
  readonly is_truncated: number;
  readonly blocked: string | null;

  // a JSON array of the parts' text
  readonly parts: string;

  // the UTF-8 bytes of every part, which the session's store limit counts
  readonly bytes: number;
  readonly stored_at: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type WebFetchTables = CheckedTables<
  Readonly<{ web_fetch_links: WebFetchLinkRow; web_fetch_pages: WebFetchPageRow }>
>;
