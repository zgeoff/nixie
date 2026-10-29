import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { taskRoutesMigration } from './task-routes-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-task-routes-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(taskRoutesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 30, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(taskRoutesMigration) + 1).toBe(30);
  expect(nixieSchema.oldestReader).toBeLessThan(30);
});

test('it keeps each task of a database it upgrades, started by nobody in no step', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('conversation', 1, 'waiting', 1, 1, 3, 0, 0, 1, 1)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const rows =
    await sql`select task_id, state, committed_steps, started_by, start_step from tasks`.execute(
      ctx.db,
    );

  expect(rows.rows).toStrictEqual([
    {
      task_id: 'conversation',
      state: 'waiting',
      committed_steps: 3,
      started_by: null,
      start_step: null,
    },
  ]);
});

test('it refuses a route for a message the log does not hold', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.routed', 'snapshot-a', '{}')`.execute(ctx.db);

  const refused = await sql`insert into message_routes (message_sequence, task_id, routed_sequence)
    values (7, 'k3x9m2p7qa', 1)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
