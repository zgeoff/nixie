import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-dialect-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const path = join(dir, 'nixie.db');
  const db = new Kysely<unknown>({ dialect: buildSqliteWorkerDialect(path) });

  stack.defer(() => db.destroy());

  return { stack, path, db };
}

test('it opens the database in WAL mode with a full sync on every commit', async () => {
  const ctx = await setupTest();

  const journal = await sql<{ journal_mode: string }>`pragma journal_mode`.execute(ctx.db);
  const synchronous = await sql<{ synchronous: number }>`pragma synchronous`.execute(ctx.db);

  expect(journal.rows).toStrictEqual([{ journal_mode: 'wal' }]);
  expect(synchronous.rows).toStrictEqual([{ synchronous: 2 }]);
});

test('it reports the inserted row ID and the affected row count', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key, title text not null)`.execute(ctx.db);
  await sql`insert into notes (title) values ('first')`.execute(ctx.db);

  const result = await sql`insert into notes (title) values ('second')`.execute(ctx.db);

  expect(result.insertId).toBe(2n);
  expect(result.numAffectedRows).toBe(1n);
});

test('it returns the rows of a statement with RETURNING', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key, title text not null)`.execute(ctx.db);

  const result = await sql<{
    id: number;
    title: string;
  }>`insert into notes (title) values ('first') returning id, title`.execute(ctx.db);

  expect(result.rows).toStrictEqual([{ id: 1, title: 'first' }]);
});

test('it rejects a failed statement with the SQLite result code', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key, title text not null unique)`.execute(
    ctx.db,
  );
  await sql`insert into notes (title) values ('same')`.execute(ctx.db);

  const insert = sql`insert into notes (title) values ('same')`.execute(ctx.db);

  await insert.catch(() => {});

  expect(insert).rejects.toMatchObject({
    name: 'DatabaseError',
    code: 'SQLITE_CONSTRAINT_UNIQUE',
  });
});

test('it loses no update when 2 connections race read-then-write transactions', async () => {
  const ctx = await setupTest();

  const other = new Kysely<unknown>({ dialect: buildSqliteWorkerDialect(ctx.path) });

  ctx.stack.defer(() => other.destroy());
  await sql`create table counter (id integer primary key, value integer not null)`.execute(ctx.db);
  await sql`insert into counter (id, value) values (1, 0)`.execute(ctx.db);

  // a plain BEGIN fails most of these with "database is locked"; BEGIN IMMEDIATE queues them
  await Promise.all(
    [ctx.db, other].flatMap((db) =>
      Array.from({ length: 25 }, () =>
        db.transaction().execute(async (tx) => {
          const result = await sql<{ value: number }>`select value from counter`.execute(tx);
          const [row] = result.rows;

          await sql`update counter set value = ${(row?.value ?? 0) + 1}`.execute(tx);
        }),
      ),
    ),
  );

  const result = await sql<{ value: number }>`select value from counter`.execute(ctx.db);

  expect(result.rows).toStrictEqual([{ value: 50 }]);
});

test('it keeps the event loop free while a long query runs', async () => {
  const ctx = await setupTest();

  const order: string[] = [];
  const query =
    sql`with recursive n(i) as (select 1 union all select i + 1 from n where i < 3000000)
    select count(*) from n`.execute(ctx.db);

  setTimeout(() => {
    order.push('timer');
  }, 0);
  await query;
  order.push('query');

  expect(order).toStrictEqual(['timer', 'query']);
});

test('it refuses a transaction with an isolation level', async () => {
  const ctx = await setupTest();

  const transaction = ctx.db
    .transaction()
    .setIsolationLevel('serializable')
    .execute(() => Promise.resolve());

  await transaction.catch(() => {});

  expect(transaction).rejects.toThrowWithMessage(
    Error,
    'SQLite transactions take no isolation level or access mode',
  );
});

test('it fails the rest of a transaction that SQLite rolled back on its own, and commits none of it', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id text primary key)`.execute(ctx.db);
  await sql`create table refused (id text primary key)`.execute(ctx.db);
  await sql`create trigger refuse before insert on refused
    begin select raise(rollback, 'refused'); end`.execute(ctx.db);

  const transaction = ctx.db.transaction().execute(async (tx) => {
    await sql`insert into notes (id) values ('before')`.execute(tx);
    await sql`insert into refused (id) values ('r1')`.execute(tx).catch(() => {});
    await sql`insert into notes (id) values ('after')`.execute(tx);
  });

  await transaction.catch(() => {});

  const notes = await sql`select id from notes`.execute(ctx.db);

  expect(transaction).rejects.toThrowWithMessage(
    Error,
    'SQLite rolled the transaction back after an earlier error',
  );
  expect(notes.rows).toStrictEqual([]);
});

test('it runs every statement of a block of SQL without parameters', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id text primary key); create table tags (id text primary key)`.execute(
    ctx.db,
  );

  const tables =
    await sql`select name from sqlite_schema where type = 'table' order by name`.execute(ctx.db);

  expect(tables.rows).toStrictEqual([{ name: 'notes' }, { name: 'tags' }]);
});
