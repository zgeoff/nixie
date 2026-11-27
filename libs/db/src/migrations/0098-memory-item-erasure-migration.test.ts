import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { SchemaTooNewError } from '../schema/schema-too-new-error';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { memoryItemErasureMigration } from './0098-memory-item-erasure-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-memory-item-erasure-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  return {
    upgrade: () => runMigrations(db, { schema: nixieSchema, copyDir: directory }),
    startPreviousRelease: () =>
      runMigrations(db, {
        schema: { migrations: nixieSchema.migrations.slice(0, 97), oldestReader: 0 },
        copyDir: directory,
      }),
  };
}

test('it registers as migration 98, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(memoryItemErasureMigration) + 1).toBe(98);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(98);
});

test('it refuses to open the upgraded database to the release before it', async () => {
  const ctx = await setupTest();

  await ctx.upgrade();

  const run = ctx.startPreviousRelease();

  await Promise.allSettled([run]);

  expect(run).rejects.toBeInstanceOf(SchemaTooNewError);
});
