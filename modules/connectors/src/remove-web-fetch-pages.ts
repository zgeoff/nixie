import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { match } from 'ts-pattern';
import type { WebFetchTables } from './web-fetch-tables';

// A thread removal is a forget's: every page of every session on the thread. A stored removal
// follows a new page: every page of the thread's earlier sessions, which no call can reach again,
// and the session's oldest pages past its store limit.
export type PageRemoval =
  | { readonly kind: 'thread'; readonly thread: string }
  | {
      readonly kind: 'stored';
      readonly thread: string;
      readonly sessionKey: string;
      readonly storeBytes: number;
    };

export async function removeWebFetchPages(
  tx: Transaction<unknown>,
  removal: PageRemoval,
): Promise<void> {
  const tables = tx.$extendTables<WebFetchTables>();

  await match(removal)
    .with({ kind: 'thread' }, (thread) =>
      tables.deleteFrom('web_fetch_pages').where('thread', '=', thread.thread).execute(),
    )
    .with({ kind: 'stored' }, async (stored) => {
      await tables
        .deleteFrom('web_fetch_pages')
        .where('thread', '=', stored.thread)
        .where('session_key', '!=', stored.sessionKey)
        .execute();

      const pages = await tables
        .selectFrom('web_fetch_pages')
        .select(['page_id', 'bytes'])
        .where('session_key', '=', stored.sessionKey)
        .orderBy('stored_at', 'desc')
        .orderBy(sql`rowid`, 'desc')
        .execute();

      const evicted = collectEvictedPages(pages, stored.storeBytes);

      if (evicted.length > 0) {
        await tables
          .deleteFrom('web_fetch_pages')
          .where('session_key', '=', stored.sessionKey)
          .where('page_id', 'in', evicted)
          .execute();
      }
    })
    .exhaustive();
}

interface StoredPageSize {
  readonly page_id: string;
  readonly bytes: number;
}

// The newest page always stays, even past the limit on its own, so the call that stored it can
// return it.
function collectEvictedPages(newestFirst: readonly StoredPageSize[], storeBytes: number): string[] {
  let keptBytes = 0;

  return newestFirst.flatMap((page, index) => {
    keptBytes += page.bytes;

    return index > 0 && keptBytes > storeBytes ? [page.page_id] : [];
  });
}
