import type { Log, LogTables } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { ModelsRecordKind } from '@heynixie/models';
import type { Transaction } from 'kysely';
import type { WebFetchTables } from './web-fetch-tables';

export interface LinkNumbering {
  readonly sessionKey: string;
  readonly thread: string;
  readonly urls: readonly string[];

  // the newest session invalidation on the thread when the session's step began, or null for links
  // of no conversation session
  readonly invalidatedThrough: number | null;
}

// Writes the next of the session's own numbers for each URL it has not numbered, and returns every
// URL's number. Once a newer invalidation ended the session it writes nothing and returns null, so
// a fetch that outlives a forget's cleanup leaves no URL behind it.
export function writeLinkNumbers(
  log: Pick<Log, 'writer'>,
  numbering: LinkNumbering,
): Promise<ReadonlyMap<string, number> | null> {
  const urls = [...new Set(numbering.urls)];

  return withWriteTransaction(log.writer, async (tx) => {
    const hasEnded = await probeSessionEnded(tx, numbering);

    if (hasEnded) {
      return null;
    }

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

// the models module registers the invalidation's kind with the log, and a forget's cleanup commits
// it before it removes the thread's links
const invalidatedKind: ModelsRecordKind = 'model.session_invalidated';

async function probeSessionEnded(
  tx: Transaction<unknown>,
  numbering: LinkNumbering,
): Promise<boolean> {
  if (numbering.invalidatedThrough === null) {
    return false;
  }

  const newest = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((query) => query.fn.max('sequence').as('sequence'))
    .where('thread', '=', numbering.thread)
    .where('kind', '=', invalidatedKind)
    .executeTakeFirst();

  return (newest?.sequence ?? 0) > numbering.invalidatedThrough;
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
