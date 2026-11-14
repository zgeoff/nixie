import type { Log } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';
import type { WebFetchTables } from './web-fetch-tables';
import type { StoredPage } from './write-web-fetch-page';

export interface CachedPageQuery {
  readonly sessionKey: string;

  // a URL in the form that buildCacheURL gives
  readonly url: string;

  // the oldest stored_at that still answers
  readonly storedAfter: number;
}

const partsSchema = z.array(z.string());

// The newest page of the session that a sent URL asked for, or that the fetch ended at, with a 2xx
// status and no blocked reason, stored after the given time.
export async function readCachedWebFetchPage(
  log: Pick<Log, 'writer'>,
  query: CachedPageQuery,
): Promise<StoredPage | null> {
  const row = await log.writer.db
    .$extendTables<WebFetchTables>()
    .selectFrom('web_fetch_pages')
    .selectAll()
    .where('session_key', '=', query.sessionKey)
    .where((eb) => eb.or([eb('fetch_url', '=', query.url), eb('url', '=', query.url)]))
    .where('status', '>=', 200)
    .where('status', '<=', 299)
    .where('blocked', 'is', null)
    .where('stored_at', '>', query.storedAfter)
    .orderBy('stored_at', 'desc')

    // rows of one stored_at, which a coarse clock gives, come back newest insert first
    .orderBy(sql`rowid`, 'desc')
    .executeTakeFirst();

  return row === undefined
    ? null
    : {
        pageID: row.page_id,
        url: row.url,
        status: row.status,
        contentType: row.content_type,
        isTruncated: row.is_truncated === 1,
        blocked: row.blocked,
        parts: partsSchema.parse(JSON.parse(row.parts)),
      };
}
