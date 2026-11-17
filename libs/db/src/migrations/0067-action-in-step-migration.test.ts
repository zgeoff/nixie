import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { actionInStepMigration } from './0067-action-in-step-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-action-in-step-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(actionInStepMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it is the migration of version 67', () => {
  expect(nixieSchema.migrations.indexOf(actionInStepMigration) + 1).toBe(67);
});

test('it marks each action it upgrades as one that the action runner runs', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}'),
      (2, 1767225600000, 'action.queued', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('k3v8n2p6wd', 0, 'waiting', 1, 1, 1, 0, 0, 1, 1)`.execute(ctx.db);

  await sql`insert into actions (action_id, task_id, step_key, action_hash, tool, status,
    attempt_count, attempt_open, next_attempt_at, reason, queued_sequence, outcome_sequence,
    updated_sequence)
    values ('5e0b2c4a-81f7-4d3e-9a6c-0f2d7b1e8c35', 'k3v8n2p6wd', 'k3v8n2p6wd:1', 'hash-a', 'send',
      'pending', 0, 0, 1767225600000, null, 2, null, 2)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const rows = await sql`select runs_in_step from actions`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ runs_in_step: 0 }]);
});
