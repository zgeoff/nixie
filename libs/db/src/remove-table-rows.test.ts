import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { removeTableRows } from './remove-table-rows';
import { startDatabase } from './start-database';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-table-rows-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = startDatabase(join(dir, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { db };
}

test('it deletes every row of every table but the kept ones', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key) strict`.execute(ctx.db);
  await sql`create table tags (tag text primary key) strict`.execute(ctx.db);
  await sql`insert into notes (id) values (1), (2)`.execute(ctx.db);
  await sql`insert into tags (tag) values ('errand')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => removeTableRows(tx, []));

  const notes = await sql`select id from notes`.execute(ctx.db);
  const tags = await sql`select tag from tags`.execute(ctx.db);

  expect(notes.rows).toStrictEqual([]);
  expect(tags.rows).toStrictEqual([]);
});

test('it never touches the rows of a kept table', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key) strict`.execute(ctx.db);
  await sql`create table tags (tag text primary key) strict`.execute(ctx.db);
  await sql`insert into notes (id) values (1)`.execute(ctx.db);
  await sql`insert into tags (tag) values ('errand'), ('garden')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => removeTableRows(tx, ['tags']));

  const tags = await sql`select tag from tags order by tag`.execute(ctx.db);

  expect(tags.rows).toStrictEqual([{ tag: 'errand' }, { tag: 'garden' }]);
});

test('it leaves the tables in place', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key) strict`.execute(ctx.db);
  await sql`insert into notes (id) values (1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => removeTableRows(tx, []));

  const tables = await sql`select name from sqlite_master where type = 'table'`.execute(ctx.db);

  expect(tables.rows).toStrictEqual([{ name: 'notes' }]);
});
