import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { spendRoutesMigration } from './0084-spend-routes-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-spend-routes-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 84 and leaves the oldest reader below it', () => {
  expect([
    nixieSchema.migrations.indexOf(spendRoutesMigration) + 1,
    nixieSchema.oldestReader < 84,
  ]).toStrictEqual([84, true]);
});

test.each([
  [
    'spend_route_stops',
    ['route_id', 'period', 'limit_amount', 'spent_amount', 'at', 'resets_at', 'updated_sequence'],
  ],
  ['spend_route_holds', ['task_id', 'route_id', 'updated_sequence']],
  ['spend_route_raises', ['route_id', 'start', 'dollars', 'raised_by', 'at', 'updated_sequence']],
])('it creates the table %s', async (table, names) => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info(${table}) order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual(names.map((name) => ({ name })));
});
