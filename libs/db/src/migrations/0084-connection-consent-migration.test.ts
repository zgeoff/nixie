import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { connectionConsentMigration } from './0084-connection-consent-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-connection-consent-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 84', () => {
  expect(nixieSchema.migrations.indexOf(connectionConsentMigration) + 1).toBe(84);
});

test('it creates the table that holds the consent requests', async () => {
  const ctx = await setupTest();

  const columns =
    await sql`select name from pragma_table_info('consent_requests') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'consent_id' },
    { name: 'state_hash' },
    { name: 'device_session_id' },
    { name: 'oauth_client_id' },
    { name: 'connection_id' },
    { name: 'key_id' },
    { name: 'verifier_sealed' },
    { name: 'claimed_at' },
    { name: 'created_at' },
    { name: 'expires_at' },
  ]);
});

test('it adds the registration, label and scope columns and keeps each row when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into oauth_clients (oauth_client_id, provider_client_id, key_id, created_at, short_id)
    values ('a-client', 'google-id', 'a-key', 1, 'q7m2x9k4ta')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => connectionConsentMigration.up(tx));

  const clients = await sql`select short_id, picker_key, redirect_uri from oauth_clients`.execute(
    ctx.db,
  );

  const added = await sql`select name from pragma_table_info('connections')
    where name in ('label_sealed', 'granted_scopes', 'missing_scopes', 'refresh_expires_at')
    order by name`.execute(ctx.db);

  expect([clients.rows, added.rows]).toStrictEqual([
    [{ short_id: 'q7m2x9k4ta', picker_key: null, redirect_uri: null }],
    [
      { name: 'granted_scopes' },
      { name: 'label_sealed' },
      { name: 'missing_scopes' },
      { name: 'refresh_expires_at' },
    ],
  ]);
});
