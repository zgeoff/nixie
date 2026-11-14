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

test('it marks a capture written without the column as not rewritten', async () => {
  const ctx = await setupTest();

  await sql`insert into turn_input_captures
    (capture_id, task_id, step_run_id, role, profile, model, harness, source, state, opened_at)
    values ('c', 't', 's', 'task', 'p', 'm', 'agent-sdk', 'gateway', 'open', 1)`.execute(ctx.db);

  const stored = await sql`select is_rewritten from turn_input_captures`.execute(ctx.db);

  expect(stored.rows).toStrictEqual([{ is_rewritten: 0 }]);
});
