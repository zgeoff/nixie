import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { SchemaTooNewError } from '../schema/schema-too-new-error';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { expiredKeysMigration } from './0103-expired-keys-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-expired-keys-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  return {
    db,
    upgrade: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    startPreviousRelease: () =>
      runMigrations(db, {
        schema: { migrations: nixieSchema.migrations.slice(0, 102), oldestReader: 0 },
        copyDir: directory,
      }),
  };
}

test('it registers as migration 103, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(expiredKeysMigration) + 1).toBe(103);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(103);
});

test('it refuses to open the upgraded database to the release before it', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const run = ctx.startPreviousRelease();

  await Promise.allSettled([run]);

  expect(run).rejects.toBeInstanceOf(SchemaTooNewError);
});

test('it creates the table of keys that an expiry named', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const columns = await sql`select name from pragma_table_info('expired_keys')
    order by cid`.execute(ctx.db);

  const names = z.array(z.object({ name: z.string() })).parse(columns.rows);

  expect(names).toStrictEqual([{ name: 'key_id' }, { name: 'started_sequence' }]);
});
