import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { triggersMigration } from './0063-triggers-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-triggers-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeKey: (sourceKey: string) =>
      sql`insert into trigger_keys (source_key, sequence) values (${sourceKey}, 1)`.execute(db),
  };
}

test('it is the migration of version 63', () => {
  expect(nixieSchema.migrations.indexOf(triggersMigration) + 1).toBe(63);
});

test('it creates the 3 tables empty', async () => {
  const ctx = await setupTest();

  const names = await sql`select name from sqlite_master
    where type = 'table' and name like 'trigger_%' order by name`.execute(ctx.db);

  expect(names.rows).toStrictEqual([
    { name: 'trigger_definitions' },
    { name: 'trigger_keys' },
    { name: 'trigger_sources' },
  ]);
});

test('it refuses a second write of one trigger key', async () => {
  const ctx = await setupTest();

  await ctx.writeKey('schedule\nwater-the-tomatoes|2027-03-12T08:00');

  const second = ctx.writeKey('schedule\nwater-the-tomatoes|2027-03-12T08:00');

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
});

test('it keeps the rows when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.writeKey('schedule\nwater-the-tomatoes|2027-03-12T08:00');
  await ctx.db.transaction().execute((tx) => triggersMigration.up(tx));

  const rows = await sql`select source_key from trigger_keys`.execute(ctx.db);

  expect(rows.rows).toHaveLength(1);
});
