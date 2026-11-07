import type { LogTables } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { ModelsRecordKind } from '@heynixie/models';
import { modelSessionOpenedCodec } from '@heynixie/models';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { match } from 'ts-pattern';
import type { WebFetchTables } from './web-fetch-tables';

// A thread removal is a forget's: every page of every session on the thread. A stored removal
// follows a new page: every page of the thread's ended conversation sessions, which no call can
// reach again, and the session's oldest other pages past its store limit.
export type PageRemoval =
  | { readonly kind: 'thread'; readonly thread: string }
  | {
      readonly kind: 'stored';
      readonly thread: string;
      readonly sessionKey: string;
      readonly pageID: string;
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
      await removeEndedSessionPages(tx, stored.thread, stored.sessionKey);

      const pages = await tables
        .selectFrom('web_fetch_pages')
        .select(['page_id', 'bytes'])
        .where('session_key', '=', stored.sessionKey)
        .orderBy(sql`rowid`, 'desc')
        .execute();

      const evicted = collectEvictedPages(pages, stored.pageID, stored.storeBytes);

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

// a conversation session's opening record keeps its key, and a thread runs one session at a time,
// so a key an opening names that is not the caller's belongs to an ended session; a call under a
// run's own token keys its pages by the run, which no opening names
const openedKind: ModelsRecordKind = 'model.session_opened';

async function removeEndedSessionPages(
  tx: Transaction<unknown>,
  thread: string,
  sessionKey: string,
): Promise<void> {
  const tables = tx.$extendTables<WebFetchTables>();

  const others = await tables
    .selectFrom('web_fetch_pages')
    .select('session_key')
    .distinct()
    .where('thread', '=', thread)
    .where('session_key', '!=', sessionKey)
    .execute();

  if (others.length === 0) {
    return;
  }

  const openings = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', thread)
    .where('kind', '=', openedKind)
    .execute();

  const ended = collectEndedSessionKeys(
    others.map((row) => row.session_key),
    openings.map((row) => row.payload),
  );

  if (ended.length > 0) {
    await tables
      .deleteFrom('web_fetch_pages')
      .where('thread', '=', thread)
      .where('session_key', 'in', ended)
      .execute();
  }
}

function collectEndedSessionKeys(
  candidates: readonly string[],
  openingPayloads: readonly string[],
): string[] {
  const openedKeys = new Set(
    openingPayloads.flatMap((payload) => {
      const key = modelSessionOpenedCodec.tryDecodePartial(parseJSONObject(payload))?.sessionKey;

      return key === undefined ? [] : [key];
    }),
  );

  return candidates.filter((candidate) => openedKeys.has(candidate));
}

interface StoredPageSize {
  readonly page_id: string;
  readonly bytes: number;
}

// The page just stored always stays, even past the limit on its own, so the call that stored it can
// return it, and the others go from the oldest insert, which the clock cannot reorder.
function collectEvictedPages(
  newestFirst: readonly StoredPageSize[],
  keptPageID: string,
  storeBytes: number,
): string[] {
  const kept = newestFirst.find((page) => page.page_id === keptPageID);
  let keptBytes = kept?.bytes ?? 0;

  return newestFirst.flatMap((page) => {
    if (page.page_id === keptPageID) {
      return [];
    }

    keptBytes += page.bytes;

    return keptBytes > storeBytes ? [page.page_id] : [];
  });
}
