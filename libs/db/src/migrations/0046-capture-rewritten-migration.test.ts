import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { captureRewrittenMigration } from './0046-capture-rewritten-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-capture-rewritten-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 46, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(captureRewrittenMigration) + 1).toBe(46);
  expect(nixieSchema.oldestReader).toBe(35);
});

test('it refuses a capture mark outside 0 and 1', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into turn_input_captures
    (capture_id, task_id, step_run_id, role, profile, model, harness, is_rewritten, source, state, opened_at)
    values ('c', 't', 's', 'task', 'p', 'm', 'agent-sdk', 2, 'gateway', 'open', 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});
