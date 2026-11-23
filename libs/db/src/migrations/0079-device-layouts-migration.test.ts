import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { deviceLayoutsMigration } from './0079-device-layouts-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-device-layouts-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 79', () => {
  expect(nixieSchema.migrations.indexOf(deviceLayoutsMigration) + 1).toBe(79);
});

test('it creates the table that points a device at its layout', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('device_layouts') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'device_id' },
    { name: 'layout_sequence' },
    { name: 'updated_at' },
  ]);
});

test('it creates the table that points each region at its content', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('device_regions') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'device_id' },
    { name: 'region' },
    { name: 'shown_sequence' },
  ]);
});

test('it keeps each region when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into device_regions (device_id, region, shown_sequence)
    values ('dk4m7q2w9x', 'note', 7)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => deviceLayoutsMigration.up(tx));

  const regions = await sql`select region from device_regions`.execute(ctx.db);

  expect(regions.rows).toStrictEqual([{ region: 'note' }]);
});
