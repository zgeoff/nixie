import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';
import { startDatabase } from './start-database';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-query-rows-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = startDatabase(join(directory, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { db };
}

test('it returns each row the query reads, parsed by the row schema', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key, title text not null) strict`.execute(
    ctx.db,
  );

  await sql`insert into notes (id, title) values (1, 'buy string'), (2, 'mend fence')`.execute(
    ctx.db,
  );

  const rows = await readQueryRows(
    sql`select id, title from notes order by id`,
    ctx.db,
    z.object({ id: z.number(), title: z.string() }),
  );

  expect(rows).toStrictEqual([
    { id: 1, title: 'buy string' },
    { id: 2, title: 'mend fence' },
  ]);
});

test('it refuses a row that does not fit the row schema', async () => {
  const ctx = await setupTest();

  await sql`create table notes (id integer primary key, title text) strict`.execute(ctx.db);
  await sql`insert into notes (id, title) values (1, null)`.execute(ctx.db);

  const read = readQueryRows(
    sql`select id, title from notes`,
    ctx.db,
    z.object({ id: z.number(), title: z.string() }),
  );

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ issues: [{ path: [0, 'title'] }] });
});
