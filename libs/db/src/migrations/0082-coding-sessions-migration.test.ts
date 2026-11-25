import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { codingSessionsMigration } from './0082-coding-sessions-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-coding-sessions-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 82', () => {
  expect(nixieSchema.migrations.indexOf(codingSessionsMigration) + 1).toBe(82);
});

test('it creates the table of bound sessions', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('coding_sessions') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'task_id' },
    { name: 'adapter' },
    { name: 'session_id' },
    { name: 'origin' },
    { name: 'state' },
    { name: 'wake' },
    { name: 'hop' },
    { name: 'from_cursor' },
    { name: 'last_event_at' },
    { name: 'unbound_at' },
    { name: 'updated_sequence' },
    { name: 'held_answers' },
  ]);
});

test('it creates the table of short IDs with one ID for each session', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('coding_session_ids') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'short_id' },
    { name: 'adapter' },
    { name: 'session_id' },
    { name: 'named_sequence' },
  ]);
});

test('it keeps each short ID when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into coding_session_ids (short_id, adapter, session_id, named_sequence)
    values ('cs4k7m2xq9', 'atc', 'cloud.3f9a1c2e.5d0c7a14', 3)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => codingSessionsMigration.up(tx));

  const ids = await sql`select short_id from coding_session_ids`.execute(ctx.db);

  expect(ids.rows).toStrictEqual([{ short_id: 'cs4k7m2xq9' }]);
});
