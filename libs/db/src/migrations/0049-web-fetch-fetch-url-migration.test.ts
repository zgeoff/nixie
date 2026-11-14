import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { webFetchFetchURLMigration } from './0049-web-fetch-fetch-url-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-web-fetch-fetch-url-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 49', () => {
  expect(nixieSchema.migrations.indexOf(webFetchFetchURLMigration) + 1).toBe(49);
});

test('it reads the sent URL of a page stored before the migration as null', async () => {
  const ctx = await setupTest();

  await sql`insert into web_fetch_pages (session_key, page_id, thread, url, status, content_type,
    is_truncated, blocked, parts, bytes, stored_at)
    values ('session-a', 'qx7f2m9kpa', 'conversation', 'https://harbour.test/ferries', 200,
      'text/html', 0, null, '["Ferries leave at nine."]', 23, 1767225600000)`.execute(ctx.db);

  const stored = await sql`select fetch_url from web_fetch_pages`.execute(ctx.db);

  expect(stored.rows).toStrictEqual([{ fetch_url: null }]);
});
