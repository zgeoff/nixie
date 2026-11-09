import { createShortID } from '@heynixie/db';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { parseLinkMarks } from '@heynixie/wire';
import { collectPageParts } from './collect-page-parts';
import type { PageSession } from './get-page-session';
import { probeSessionEnded } from './probe-session-ended';
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
        stored_at: log.writer.clock.now(),
      })
      .execute();

    await removeWebFetchPages(tx, {
      kind: 'stored',
      thread: session.thread,
      sessionKey: session.sessionKey,
      pageID: stored.pageID,
      storeBytes: limits.storeBytes,
    });

    return stored;
  });
}
