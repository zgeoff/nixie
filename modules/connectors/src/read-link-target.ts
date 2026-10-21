import type { Log } from '@heynixie/log';
import type { WebFetchTables } from './web-fetch-tables';

export interface LinkRef {
  readonly sessionKey: string;
  readonly number: number;
}

// Reads the target of the link the session numbered, or null when the session gave no link that
// number, as with a number an earlier session gave.
export async function readLinkTarget(
  log: Pick<Log, 'writer'>,
  link: LinkRef,
): Promise<string | null> {
  const row = await log.writer.db
    .$extendTables<WebFetchTables>()
    .selectFrom('web_fetch_links')
    .select('url')
    .where('session_key', '=', link.sessionKey)
    .where('number', '=', link.number)
    .executeTakeFirst();

  return row?.url ?? null;
}
