import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { deviceSavedLayoutsMigration } from './0080-device-saved-layouts-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-device-saved-layouts-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 80', () => {
  expect(nixieSchema.migrations.indexOf(deviceSavedLayoutsMigration) + 1).toBe(80);
});

test('it creates the table that holds a device saved layouts', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('device_saved_layouts') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'saved_id' },
    { name: 'device_id' },
    { name: 'name' },
    { name: 'layout_sequence' },
    { name: 'regions' },
    { name: 'saved_at' },
  ]);
});

test('it holds one layout for each device and name', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select info.name from pragma_index_list('device_saved_layouts') as list
    join pragma_index_info(list.name) as info
    where list."unique" = 1 and list.origin = 'u'
    order by info.seqno`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([{ name: 'device_id' }, { name: 'name' }]);
});

test('it keeps each saved layout when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into device_saved_layouts
    (saved_id, device_id, name, layout_sequence, regions, saved_at)
    values (${crypto.randomUUID()}, 'dk4m7q2w9x', 'evening', 7, '[]', 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => deviceSavedLayoutsMigration.up(tx));

  const saved = await sql`select name from device_saved_layouts`.execute(ctx.db);

  expect(saved.rows).toStrictEqual([{ name: 'evening' }]);
});
