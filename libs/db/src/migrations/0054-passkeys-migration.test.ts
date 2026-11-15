import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { passkeysMigration } from './0054-passkeys-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-passkeys-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 54', () => {
  expect(nixieSchema.migrations.indexOf(passkeysMigration) + 1).toBe(54);
});

test('it creates a table that holds one row for each passkey', async () => {
  const ctx = await setupTest();

  const columns = await sql`select name from pragma_table_info('passkeys') order by cid`.execute(
    ctx.db,
  );

  expect(columns.rows).toStrictEqual([
    { name: 'passkey_id' },
    { name: 'credential_id' },
    { name: 'public_key' },
    { name: 'user_handle' },
    { name: 'rp_id' },
    { name: 'origin' },
    { name: 'sign_count' },
    { name: 'backup_eligible' },
    { name: 'backed_up' },
    { name: 'transports' },
    { name: 'aaguid' },
    { name: 'label' },
    { name: 'registered_by' },
    { name: 'authorized_by' },
    { name: 'registered_at' },
    { name: 'last_used_at' },
    { name: 'revoked_at' },
  ]);
});

test('it keeps each passkey when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into passkeys (passkey_id, credential_id, public_key, user_handle, rp_id, origin,
    sign_count, backup_eligible, backed_up, transports, aaguid, label, registered_by, authorized_by,
    registered_at) values ('p-1', 'cred-1', x'01', x'02', 'nixie.example.org',
    'https://nixie.example.org', 0, 1, 1, '[]', 'zeros', 'Phone', 'id-1', 'code', 1000)`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => passkeysMigration.up(tx));

  const rows = await sql`select passkey_id from passkeys`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ passkey_id: 'p-1' }]);
});
