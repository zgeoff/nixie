import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { ruleExportsMigration } from './rule-exports-migration';
import { runMigrations } from './run-migrations';
import { readRunPrefix } from './test-utils/read-run-prefix';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-rule-exports-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 38, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(ruleExportsMigration) + 1).toBe(38);
  expect(nixieSchema.oldestReader).toBe(35);
});

test('it refuses a rule export state outside opened and closed', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into rule_exports (export_id, state, updated_at)
    values ('export-a', 'merged', 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});
