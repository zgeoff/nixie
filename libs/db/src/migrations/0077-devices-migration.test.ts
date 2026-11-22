import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { devicesMigration } from './0077-devices-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-devices-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 77', () => {
  expect(nixieSchema.migrations.indexOf(devicesMigration) + 1).toBe(77);
});

test('it creates the table that holds each enrolled device', async () => {
  const ctx = await setupTest();

  const columns = await sql`select name from pragma_table_info('devices') order by cid`.execute(
    ctx.db,
  );

  expect(columns.rows).toStrictEqual([
    { name: 'device_id' },
    { name: 'identity_id' },
    { name: 'name' },
    { name: 'capabilities' },
    { name: 'shown_sequence' },
    { name: 'idle_sequence' },
    { name: 'updated_at' },
  ]);
});

test('it gives a session and a code the full scope unless they say otherwise', async () => {
  const ctx = await setupTest();

  await sql`insert into enrolment_codes (code_hash, issued_at, expires_at)
    values ('a-hash', 1, 2)`.execute(ctx.db);

  const codes = await sql`select scope from enrolment_codes`.execute(ctx.db);

  expect(codes.rows).toStrictEqual([{ scope: 'full' }]);
});

test('it keeps each device when it runs again', async () => {
  const ctx = await setupTest();

  await sql`pragma foreign_keys = off`.execute(ctx.db);

  await sql`insert into devices (device_id, identity_id, name, capabilities, updated_at)
    values ('dk4m7q2w9x', 'an-identity', 'desk panel', '{"screen":false}', 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => devicesMigration.up(tx));

  const devices = await sql`select device_id from devices`.execute(ctx.db);

  expect(devices.rows).toStrictEqual([{ device_id: 'dk4m7q2w9x' }]);
});
