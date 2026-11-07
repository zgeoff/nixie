import { createShortID } from '@heynixie/db';
import type { Log, LogTables } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { ModelsRecordKind } from '@heynixie/models';
import { parseLinkMarks } from '@heynixie/wire';
import type { Transaction } from 'kysely';
import { collectPageParts } from './collect-page-parts';
import { removeWebFetchPages } from './remove-web-fetch-pages';
import type { LinkedTextLimits } from './render-linked-text';
import { renderLinkedText } from './render-linked-text';
import type { WebFetchTables } from './web-fetch-tables';
import { writeLinkNumbers } from './write-link-numbers';

// a page as the fetcher read it, its text holding a mark where each link ends
export interface FetchedPage {
  readonly url: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly isTruncated: boolean;
  readonly blocked: string | null;
  readonly text: string;
  readonly links: readonly string[];
}

export interface PageSession {
  readonly sessionKey: string;
  readonly thread: string;

  // the newest session invalidation on the thread when the session's step began, or null for a
  // call of no conversation session
  readonly invalidatedThrough: number | null;
}

export interface PageLimits extends LinkedTextLimits {
  // the most bytes of parts one session's stored pages hold
  readonly storeBytes: number;
}

export interface StoredPage {
  readonly pageID: string;
  readonly url: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly isTruncated: boolean;
  readonly blocked: string | null;
  readonly parts: readonly string[];
}

// Once a newer invalidation ended the session it writes nothing and returns null, so a fetch that
// outlives a forget's cleanup leaves no link or page behind it.
export function writeWebFetchPage(
  log: Pick<Log, 'writer'>,
  page: FetchedPage,
  session: PageSession,
  limits: PageLimits,
): Promise<StoredPage | null> {
  return withWriteTransaction(log.writer, async (tx) => {
    const hasEnded = await probeSessionEnded(tx, session);

    if (hasEnded) {
      return null;
    }

    const marked = parseLinkMarks(page.text);

    const urls = marked.flatMap((part) => {
      const target = typeof part === 'string' ? undefined : page.links[part.link];

      return target === undefined ? [] : [target];
    });

    const numbers = await writeLinkNumbers(tx, {
      sessionKey: session.sessionKey,
      thread: session.thread,
      urls,
    });

    const linked = renderLinkedText(
      marked,
      { pageURL: page.url, targets: page.links, numbers },
      limits,
    );

    const stored: StoredPage = {
      pageID: createShortID(),
      url: page.url,
      status: page.status,
      contentType: page.contentType,
      isTruncated: page.isTruncated,
      blocked: page.blocked,
      parts: collectPageParts(linked, limits.textBytes),
    };

    await tx
      .$extendTables<WebFetchTables>()
      .insertInto('web_fetch_pages')
      .values({
        session_key: session.sessionKey,
        page_id: stored.pageID,
        thread: session.thread,
        url: stored.url,
        status: stored.status,
        content_type: stored.contentType,
        is_truncated: stored.isTruncated ? 1 : 0,
        blocked: stored.blocked,
        parts: JSON.stringify(stored.parts),
        bytes: stored.parts.reduce((sum, part) => sum + Buffer.byteLength(part), 0),
        stored_at: Date.now(),
      })
      .execute();

    await removeWebFetchPages(tx, {
      kind: 'stored',
      thread: session.thread,
      sessionKey: session.sessionKey,
      storeBytes: limits.storeBytes,
    });

    return stored;
  });
}

// the models module registers the invalidation's kind with the log, and a forget's cleanup commits
// it before it removes the thread's links and pages
const invalidatedKind: ModelsRecordKind = 'model.session_invalidated';

async function probeSessionEnded(tx: Transaction<unknown>, session: PageSession): Promise<boolean> {
  if (session.invalidatedThrough === null) {
    return false;
  }

  const newest = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((query) => query.fn.max('sequence').as('sequence'))
    .where('thread', '=', session.thread)
    .where('kind', '=', invalidatedKind)
    .executeTakeFirst();

  return (newest?.sequence ?? 0) > session.invalidatedThrough;
}
