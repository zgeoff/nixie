import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { taskControlsMigration } from './task-controls-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-task-controls-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(taskControlsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 32, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(taskControlsMigration) + 1).toBe(32);
  expect(nixieSchema.oldestReader).toBeLessThan(32);
});

test('it keeps each task and timer of a database it upgrades, with no pause asked and no timer withdrawn', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('h7q2m9x4ka', 0, 'waiting', 1, 1, 2, 0, 0, 1, 1)`.execute(ctx.db);

  await sql`insert into timers (timer_id, task_id, due_at, set_sequence)
    values ('d1c5f0a2-6b3e-4c8a-9f17-2e4b8d6a0c93', 'h7q2m9x4ka', 1767229200000, 1)`.execute(
    ctx.db,
  );

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const tasks = await sql`select task_id, state, pause_requested, resume_state from tasks`.execute(
    ctx.db,
  );

  const timers = await sql`select timer_id, withdrawn_sequence from timers`.execute(ctx.db);

  expect(tasks.rows).toStrictEqual([
    { task_id: 'h7q2m9x4ka', state: 'waiting', pause_requested: 0, resume_state: null },
  ]);

  expect(timers.rows).toStrictEqual([
    { timer_id: 'd1c5f0a2-6b3e-4c8a-9f17-2e4b8d6a0c93', withdrawn_sequence: null },
  ]);
});
