import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { callsMigration } from './0085-calls-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-calls-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 83', () => {
  expect(nixieSchema.migrations.indexOf(callsMigration) + 1).toBe(85);
});

test('it creates the table of calls', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('calls') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'call_id' },
    { name: 'task_id' },
    { name: 'state' },
    { name: 'started_by' },
    { name: 'carrying_session' },
    { name: 'started_at' },
    { name: 'connected_at' },
    { name: 'ended_at' },
    { name: 'ended_by' },
    { name: 'minutes' },
    { name: 'updated_sequence' },
  ]);
});

test('it keeps each call when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into calls (call_id, task_id, state, started_by, carrying_session, started_at, minutes, updated_sequence)
    values ('cl4k7m2xq9', 'task-1', 'connecting', 'you', 'identity-1', 1000, 0, 5)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => callsMigration.up(tx));

  const calls = await sql`select call_id from calls`.execute(ctx.db);

  expect(calls.rows).toStrictEqual([{ call_id: 'cl4k7m2xq9' }]);
});
