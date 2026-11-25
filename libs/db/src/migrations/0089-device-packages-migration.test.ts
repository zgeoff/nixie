import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { devicePackagesMigration } from './0089-device-packages-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-device-packages-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 89', () => {
  expect(nixieSchema.migrations.indexOf(devicePackagesMigration) + 1).toBe(89);
});

test('it creates the table that holds the approved packages', async () => {
  const ctx = await setupTest();

  const columns = await sql`
    select name from pragma_table_info('device_packages') order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'package_id' },
    { name: 'name' },
    { name: 'version' },
    { name: 'integrity' },
    { name: 'unpacked_bytes' },
    { name: 'publisher' },
    { name: 'files' },
    { name: 'added_sequence' },
  ]);
});

test('it keeps each package when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into device_packages
    (package_id, name, version, integrity, unpacked_bytes, publisher, files, added_sequence)
    values ('chart.js@4.4.6', 'chart.js', '4.4.6', 'sha512-x', 10, 'jsmith', '[]', 3)`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => devicePackagesMigration.up(tx));

  const packages = await sql`select package_id from device_packages`.execute(ctx.db);

  expect(packages.rows).toStrictEqual([{ package_id: 'chart.js@4.4.6' }]);
});
