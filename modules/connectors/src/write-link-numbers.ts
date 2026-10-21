import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { WebFetchTables } from './web-fetch-tables';

export interface LinkNumbering {
  readonly sessionKey: string;
  readonly thread: string;
  readonly urls: readonly string[];
}

// Writes a number for each URL the session has not numbered yet, the next of the session's own
// count, and returns every URL's number. A URL the session already numbered keeps its number.
export function writeLinkNumbers(
  log: Pick<Log, 'writer'>,
  numbering: LinkNumbering,
): Promise<ReadonlyMap<string, number>> {
  const urls = [...new Set(numbering.urls)];

  if (urls.length === 0) {
    return Promise.resolve(new Map());
  }

  return withWriteTransaction(log.writer, async (tx) => {
    const tables = tx.$extendTables<WebFetchTables>();

    const numbers = await readKnownNumbers(tables, numbering.sessionKey, urls);

    const newURLs = urls.filter((url) => !numbers.has(url));

    if (newURLs.length === 0) {
      return numbers;
    }

    const last = await tables
      .selectFrom('web_fetch_links')
      .select((query) => query.fn.max('number').as('number'))
      .where('session_key', '=', numbering.sessionKey)
      .executeTakeFirst();

    const first = (last?.number ?? 0) + 1;

    const rows = newURLs.map((url, index) => ({
      session_key: numbering.sessionKey,
      number: first + index,
      url,
      thread: numbering.thread,
    }));

    await splitChunks(rows).reduce(async (written, chunk) => {
      await written;

      await tables.insertInto('web_fetch_links').values(chunk).execute();
    }, Promise.resolve());

    return new Map([...numbers, ...rows.map((row) => [row.url, row.number] as const)]);
  });
}

async function readKnownNumbers(
  tables: Transaction<WebFetchTables>,
  sessionKey: string,
  urls: readonly string[],
): Promise<Map<string, number>> {
  const chunks = await Promise.all(
    splitChunks(urls).map((chunk) =>
      tables
        .selectFrom('web_fetch_links')
        .select(['url', 'number'])
        .where('session_key', '=', sessionKey)
        .where('url', 'in', chunk)
        .execute(),
    ),
  );

  return new Map(chunks.flat().map((row) => [row.url, row.number]));
}

// the most values one statement binds, well inside SQLite's parameter limit at four per row, since
// a deployment's text limit sets how many links a page can mark
const chunkSize = 500;

function splitChunks<Item>(items: readonly Item[]): (readonly Item[])[] {
  return Array.from({ length: Math.ceil(items.length / chunkSize) }, (_, index) =>
    items.slice(index * chunkSize, (index + 1) * chunkSize),
  );
}
