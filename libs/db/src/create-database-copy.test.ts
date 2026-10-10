import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { createDatabaseCopy } from './create-database-copy';
import { startDatabase } from './start-database';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-copy-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = startDatabase(join(dir, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { dir, db };
}

test('it copies every committed row into a standalone database file', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id text primary key)`.execute(ctx.db);
  await sql`insert into notes (id) values ('n1'), ('n2')`.execute(ctx.db);

  await createDatabaseCopy(ctx.db, join(ctx.dir, 'copy.db'));

  const copy = new Database(join(ctx.dir, 'copy.db'), { readonly: true });

  onTestFinished(() => {
    copy.close();
  });

  expect(copy.query('select id from notes order by id').all()).toStrictEqual([
    { id: 'n1' },
    { id: 'n2' },
  ]);
});

test('it replaces an older copy and a partial copy left by an interrupted run', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id text primary key)`.execute(ctx.db);
  await writeFile(join(ctx.dir, 'copy.db'), 'an older copy');
  await writeFile(join(ctx.dir, 'copy.db.partial'), 'an interrupted copy');

  await createDatabaseCopy(ctx.db, join(ctx.dir, 'copy.db'));

  const names = await readdir(ctx.dir);
  const copy = new Database(join(ctx.dir, 'copy.db'), { readonly: true });

  onTestFinished(() => {
    copy.close();
  });

  expect(copy.query('select name from sqlite_schema').all()).toStrictEqual([
    { name: 'notes' },
    { name: 'sqlite_autoindex_notes_1' },
  ]);
  expect(names.toSorted()).toStrictEqual(['copy.db', 'nixie.db', 'nixie.db-shm', 'nixie.db-wal']);
});
