import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { webFetchPagesMigration } from './web-fetch-pages-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-web-fetch-pages-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(webFetchPagesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 37', () => {
  expect(nixieSchema.migrations.indexOf(webFetchPagesMigration) + 1).toBe(37);
});

test('it keeps the links of a database it upgrades, and stores a page', async () => {
  const ctx = await setupTest();

  await sql`insert into web_fetch_links (session_key, number, url, thread)
    values ('session-a', 1, 'https://harbour.test/ferries', 'conversation')`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into web_fetch_pages (session_key, page_id, thread, url, status, content_type,
    is_truncated, blocked, parts, bytes, stored_at)
    values ('session-a', 'qx7f2m9kpa', 'conversation', 'https://harbour.test/ferries', 200,
      'text/html', 0, null, '["Ferries leave at nine."]', 23, 1767225600000)`.execute(ctx.db);

  const links = await sql`select url from web_fetch_links`.execute(ctx.db);
  const pages = await sql`select * from web_fetch_pages`.execute(ctx.db);

  expect(links.rows).toStrictEqual([{ url: 'https://harbour.test/ferries' }]);

  expect(pages.rows).toStrictEqual([
    {
      session_key: 'session-a',
      page_id: 'qx7f2m9kpa',
      thread: 'conversation',
      url: 'https://harbour.test/ferries',
      status: 200,
      content_type: 'text/html',
      is_truncated: 0,
      blocked: null,
      parts: '["Ferries leave at nine."]',
      bytes: 23,
      stored_at: 1_767_225_600_000,
    },
  ]);
});

test('it keeps each page when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into web_fetch_pages (session_key, page_id, thread, url, status, content_type,
    is_truncated, blocked, parts, bytes, stored_at)
    values ('session-a', 'qx7f2m9kpa', 'conversation', 'https://harbour.test/ferries', 200,
      'text/html', 0, null, '["Ferries leave at nine."]', 23, 1767225600000)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => webFetchPagesMigration.up(tx));

  const pages = await sql`select page_id from web_fetch_pages`.execute(ctx.db);

  expect(pages.rows).toStrictEqual([{ page_id: 'qx7f2m9kpa' }]);
});
