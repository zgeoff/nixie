import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { codeFilesMigration } from './0052-code-files-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-code-files-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 52', () => {
  expect(nixieSchema.migrations.indexOf(codeFilesMigration) + 1).toBe(52);
});

test('it creates a table that stores one file of a result record', async () => {
  const ctx = await setupTest();

  const columns = await sql`select name from pragma_table_info('code_files') order by cid`.execute(
    ctx.db,
  );

  expect(columns.rows).toStrictEqual([
    { name: 'file_id' },
    { name: 'thread' },
    { name: 'sequence' },
    { name: 'position' },
    { name: 'bytes' },
    { name: 'media_type' },
  ]);
});

test('it keeps each file when it runs again', async () => {
  const ctx = await setupTest();

  await sql`pragma foreign_keys = off`.execute(ctx.db);

  await sql`insert into code_files (file_id, thread, sequence, position, bytes, media_type)
    values ('p3n8x2c7ke', 'task-1', 4, 0, 48213, 'image/png')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => codeFilesMigration.up(tx));

  const files = await sql`select file_id from code_files`.execute(ctx.db);

  expect(files.rows).toStrictEqual([{ file_id: 'p3n8x2c7ke' }]);
});
