import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from '../build-sqlite-worker-dialect';
import { nixieSchema } from '../nixie-schema';
import { runMigrations } from '../run-migrations';
import { searchCallsMigration } from './0036-search-calls-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-search-calls-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 36, which the release before can still read', () => {
  expect({
    version: nixieSchema.migrations.indexOf(searchCallsMigration) + 1,
    oldestReader: nixieSchema.oldestReader,
  }).toStrictEqual({ version: 36, oldestReader: 35 });
});

test("it keeps one day's count of calls", async () => {
  const ctx = await setupTest();

  await sql`insert into search_calls (day, count) values ('2026-11-07', 3)`.execute(ctx.db);

  const rows = await sql`select * from search_calls`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ day: '2026-11-07', count: 3 }]);
});

test.each([
  ['a day that is not a date', 'Saturday', 1, 'day glob'],
  ['a count of zero', '2026-11-07', 0, 'count > 0'],
])('it refuses %s', async (_, day, count, check) => {
  const ctx = await setupTest();

  const refused = await sql`insert into search_calls (day, count) values (${day}, ${count})`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({
    message: expect.stringContaining(`CHECK constraint failed: ${check}`),
  });
});
