import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { actionCancelMigration } from './action-cancel-migration';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-action-cancel-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(actionCancelMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 32, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(actionCancelMigration) + 1).toBe(32);
  expect(nixieSchema.oldestReader).toBeLessThan(32);
});

test('it keeps every action, index and foreign key of a database it upgrades, with no action cancelled', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}'),
      (2, 1767225600000, 'action.queued', 'snapshot-a', '{}'),
      (3, 1767225600000, 'action.outcome', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('k3v8n2p6wd', 0, 'waiting', 1, 1, 1, 0, 0, 1, 1)`.execute(ctx.db);

  await sql`insert into actions (action_id, task_id, step_key, action_hash, tool, status,
    attempt_count, attempt_open, next_attempt_at, reason, queued_sequence, outcome_sequence,
    updated_sequence)
    values
      ('5e0b2c4a-81f7-4d3e-9a6c-0f2d7b1e8c35', 'k3v8n2p6wd', 'k3v8n2p6wd:1', 'hash-a', 'send',
        'pending', 0, 0, 1767225600000, null, 2, null, 2),
      ('a1d7e3f9-26c4-4b8a-b05e-7c9f1d2a6e40', 'k3v8n2p6wd', 'k3v8n2p6wd:1', 'hash-b', 'send',
        'done', 1, 0, 1767225600000, null, 2, 3, 3),
      ('c8f4a0b6-3d92-4e17-8b5a-61e0f7c2d9a4', 'k3v8n2p6wd', 'k3v8n2p6wd:1', 'hash-c', 'send',
        'failed', 1, 0, 1767225600000, 'refused', 2, 3, 3),
      ('e2b9d5f1-7a03-4c6e-92d8-4f1a8b3c0e57', 'k3v8n2p6wd', 'k3v8n2p6wd:1', 'hash-d', 'send',
        'unknown', 1, 0, 1767225600000, 'ambiguous', 2, 3, 3)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const actions = await sql`select action_id, status, attempt_count, reason, outcome_sequence,
    updated_sequence, cancelled_sequence from actions order by action_hash`.execute(ctx.db);

  const indexes = await sql`select name, sql from sqlite_schema
    where type = 'index' and tbl_name = 'actions' and sql is not null order by name`.execute(
    ctx.db,
  );

  const foreignKeys = await sql`select "table", "from", "to"
    from pragma_foreign_key_list('actions') order by "from"`.execute(ctx.db);

  expect(actions.rows).toStrictEqual([
    {
      action_id: '5e0b2c4a-81f7-4d3e-9a6c-0f2d7b1e8c35',
      status: 'pending',
      attempt_count: 0,
      reason: null,
      outcome_sequence: null,
      updated_sequence: 2,
      cancelled_sequence: null,
    },
    {
      action_id: 'a1d7e3f9-26c4-4b8a-b05e-7c9f1d2a6e40',
      status: 'done',
      attempt_count: 1,
      reason: null,
      outcome_sequence: 3,
      updated_sequence: 3,
      cancelled_sequence: null,
    },
    {
      action_id: 'c8f4a0b6-3d92-4e17-8b5a-61e0f7c2d9a4',
      status: 'failed',
      attempt_count: 1,
      reason: 'refused',
      outcome_sequence: 3,
      updated_sequence: 3,
      cancelled_sequence: null,
    },
    {
      action_id: 'e2b9d5f1-7a03-4c6e-92d8-4f1a8b3c0e57',
      status: 'unknown',
      attempt_count: 1,
      reason: 'ambiguous',
      outcome_sequence: 3,
      updated_sequence: 3,
      cancelled_sequence: null,
    },
  ]);

  expect(indexes.rows).toStrictEqual([
    {
      name: 'actions_by_hash',
      sql: 'CREATE INDEX actions_by_hash on actions (task_id, action_hash)',
    },
    {
      name: 'actions_by_status',
      sql: 'CREATE INDEX actions_by_status on actions (status, next_attempt_at)',
    },
  ]);

  expect(foreignKeys.rows).toStrictEqual([
    { table: 'records', from: 'cancelled_sequence', to: 'sequence' },
    { table: 'records', from: 'outcome_sequence', to: 'sequence' },
    { table: 'records', from: 'queued_sequence', to: 'sequence' },
    { table: 'tasks', from: 'task_id', to: 'task_id' },
    { table: 'records', from: 'updated_sequence', to: 'sequence' },
  ]);
});

test('it records the stop that cancelled an action', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}'),
      (2, 1767225600000, 'action.queued', 'snapshot-a', '{}'),
      (3, 1767225600000, 'task.stopped', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('k3v8n2p6wd', 0, 'stopped', 1, 1, 1, 0, 0, 1, 1)`.execute(ctx.db);

  await sql`insert into actions (action_id, task_id, step_key, action_hash, tool, status,
    attempt_count, attempt_open, next_attempt_at, reason, queued_sequence, outcome_sequence,
    updated_sequence, cancelled_sequence)
    values ('f6a2c8e4-0b5d-4f39-a7e1-3d9b5c1f7a28', 'k3v8n2p6wd', 'k3v8n2p6wd:1', 'hash-e', 'send',
      'pending', 0, 0, 1767225600000, null, 2, null, 3, 3)`.execute(ctx.db);

  const cancelled = await sql`select status, cancelled_sequence from actions`.execute(ctx.db);

  expect(cancelled.rows).toStrictEqual([{ status: 'pending', cancelled_sequence: 3 }]);
});
