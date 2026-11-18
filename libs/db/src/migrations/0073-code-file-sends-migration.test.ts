import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { codeFileSendsMigration } from './0073-code-file-sends-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-code-file-sends-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 73', () => {
  expect(nixieSchema.migrations.indexOf(codeFileSendsMigration) + 1).toBe(73);
});

test('it creates a table that marks each file sent to the owner', async () => {
  const ctx = await setupTest();

  const columns =
    await sql`select name from pragma_table_info('code_file_sends') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'sequence' },
    { name: 'file_id' },
    { name: 'thread' },
  ]);
});

test('it keeps each send when it runs again', async () => {
  const ctx = await setupTest();

  await sql`pragma foreign_keys = off`.execute(ctx.db);

  await sql`insert into code_file_sends (sequence, file_id, thread)
    values (9, 'p3n8x2c7ke', 'conversation')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => codeFileSendsMigration.up(tx));

  const sends = await sql`select file_id from code_file_sends`.execute(ctx.db);

  expect(sends.rows).toStrictEqual([{ file_id: 'p3n8x2c7ke' }]);
});
