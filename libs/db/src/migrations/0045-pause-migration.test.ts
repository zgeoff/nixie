import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from '../build-sqlite-worker-dialect';
import { nixieSchema } from '../nixie-schema';
import { pauseMigrationVersion } from '../pause-migration-version';
import { runMigrations } from '../run-migrations';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { pauseMigration } from './0045-pause-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-pause-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1, 'nixie.paused', 'h', '{}')`.execute(db);

  return { db };
}

test('it moves the schema to the version pauseMigrationVersion names, which the release before can still read', async () => {
  const ctx = await setupTest();

  const stored = await sql`select version, oldest_reader, open_oldest_reader
    from schema_version`.execute(ctx.db);

  expect(nixieSchema.migrations.indexOf(pauseMigration) + 1).toBe(pauseMigrationVersion);
  expect(nixieSchema.oldestReader).toBe(35);

  expect(stored.rows).toStrictEqual([
    {
      version: nixieSchema.migrations.length,
      oldest_reader: 35,
      open_oldest_reader: null,
    },
  ]);
});

test('it refuses a pause row with an id other than 1', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into nixie_pause (id, cause, paused_sequence)
    values (2, 'owner', 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it refuses a restore pause with no recovery ID', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into nixie_pause (id, cause, paused_sequence)
    values (1, 'restore', 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it refuses an owner pause with a recovery ID', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into nixie_pause (id, cause, recovery_id, paused_sequence)
    values (1, 'owner', 'r', 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it accepts a restore pause with a recovery ID', async () => {
  const ctx = await setupTest();

  await sql`insert into nixie_pause (id, cause, recovery_id, paused_sequence)
    values (1, 'restore', 'r', 1)`.execute(ctx.db);

  const rows = await sql`select cause, recovery_id from nixie_pause`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ cause: 'restore', recovery_id: 'r' }]);
});

test('it runs up a second time with no error', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => pauseMigration.up(tx));

  const columns = await sql`select name from pragma_table_info('schema_version')`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([
    { name: 'id' },
    { name: 'version' },
    { name: 'oldest_reader' },
    { name: 'open_oldest_reader' },
  ]);
});
