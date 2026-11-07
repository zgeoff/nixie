import type { Log } from '@heynixie/log';
import { z } from 'zod';
import type { WebFetchTables } from './web-fetch-tables';
import type { StoredPage } from './write-web-fetch-page';

export interface PageRef {
  readonly sessionKey: string;
  readonly pageID: string;
}

const partsSchema = z.array(z.string());

export async function readWebFetchPage(
  log: Pick<Log, 'writer'>,
  page: PageRef,
): Promise<StoredPage | null> {
  const row = await log.writer.db
    .$extendTables<WebFetchTables>()
    .selectFrom('web_fetch_pages')
    .selectAll()
    .where('session_key', '=', page.sessionKey)
    .where('page_id', '=', page.pageID)
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
