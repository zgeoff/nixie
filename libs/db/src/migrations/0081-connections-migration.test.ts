import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { connectionsMigration } from './0081-connections-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-connections-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 81', () => {
  expect(nixieSchema.migrations.indexOf(connectionsMigration) + 1).toBe(81);
});

test('it creates the table that holds each connection', async () => {
  const ctx = await setupTest();

  const columns = await sql`select name from pragma_table_info('connections') order by cid`.execute(
    ctx.db,
  );

  expect(columns.rows).toStrictEqual([
    { name: 'connection_id' },
    { name: 'short_id' },
    { name: 'connector_id' },
    { name: 'oauth_client_id' },
    { name: 'key_id' },
    { name: 'account_sealed' },
    { name: 'token_key_id' },
    { name: 'refresh_token_sealed' },
    { name: 'status' },
    { name: 'status_reason' },
    { name: 'status_since' },
    { name: 'last_success_at' },
    { name: 'failures' },
    { name: 'retry_at' },
    { name: 'binding' },
    { name: 'removal_counter' },
    { name: 'created_at' },
  ]);
});

test('it creates the tables that hold OAuth clients and the marks of minted keys', async () => {
  const ctx = await setupTest();

  const clients =
    await sql`select name from pragma_table_info('oauth_clients') order by cid`.execute(ctx.db);

  const marks = await sql`select name from pragma_table_info('key_marks') order by cid`.execute(
    ctx.db,
  );

  expect([clients.rows, marks.rows]).toStrictEqual([
    [
      { name: 'oauth_client_id' },
      { name: 'connector_id' },
      { name: 'provider_client_id' },
      { name: 'key_id' },
      { name: 'secret_sealed' },
      { name: 'removal_counter' },
      { name: 'created_at' },
      { name: 'removed_at' },
    ],
    [{ name: 'key_id' }, { name: 'marked_at' }],
  ]);
});

test('it keeps each connection when it runs again', async () => {
  const ctx = await setupTest();

  await sql`pragma foreign_keys = off`.execute(ctx.db);

  await sql`insert into connections (connection_id, short_id, oauth_client_id, key_id, status, status_since, created_at)
    values ('a-connection', 'k3x9m2p7qa', 'a-client', 'a-key', 'active', 1, 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => connectionsMigration.up(tx));

  const connections = await sql`select connection_id from connections`.execute(ctx.db);

  expect(connections.rows).toStrictEqual([{ connection_id: 'a-connection' }]);
});
