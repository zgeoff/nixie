import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { notebookMigration } from './0078-notebook-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-notebook-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 78', () => {
  expect(nixieSchema.migrations.indexOf(notebookMigration) + 1).toBe(78);
});

test('it creates the notes table with the columns the design lists', async () => {
  const ctx = await setupTest();

  const columns =
    await sql`select name from pragma_table_info('notebook_notes') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'note_id' },
    { name: 'short_id' },
    { name: 'state' },
    { name: 'version' },
    { name: 'text_seq' },
    { name: 'is_private' },
    { name: 'created_at' },
    { name: 'edited_at' },
    { name: 'read_at' },
    { name: 'owner_opened_at' },
  ]);
});

test('it creates the versions table and the links table, which hold no free text', async () => {
  const ctx = await setupTest();

  const versions =
    await sql`select name from pragma_table_info('notebook_versions') order by cid`.execute(ctx.db);

  const links =
    await sql`select name from pragma_table_info('notebook_links') order by cid`.execute(ctx.db);

  expect([versions.rows, links.rows]).toStrictEqual([
    [
      { name: 'note_id' },
      { name: 'version' },
      { name: 'seq' },
      { name: 'writer' },
      { name: 'model' },
      { name: 'chars' },
      { name: 'created_at' },
    ],
    [
      { name: 'link_key' },
      { name: 'from_note_id' },
      { name: 'target_kind' },
      { name: 'target_id' },
      { name: 'type' },
      { name: 'reason_seq' },
      { name: 'created_at' },
    ],
  ]);
});

test('it keeps each note when it runs again', async () => {
  const ctx = await setupTest();

  await sql`pragma foreign_keys = off`.execute(ctx.db);

  await sql`insert into notebook_notes (note_id, short_id, state, version, text_seq, is_private, created_at, edited_at)
    values ('a-uuid', 'n4w8k2c6rd', 'active', 1, 9, 0, 1, 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => notebookMigration.up(tx));

  const notes = await sql`select short_id, state from notebook_notes`.execute(ctx.db);

  expect(notes.rows).toStrictEqual([{ short_id: 'n4w8k2c6rd', state: 'active' }]);
});
