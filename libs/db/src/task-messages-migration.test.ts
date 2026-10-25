import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { taskMessagesMigration } from './task-messages-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-task-messages-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(taskMessagesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 27', () => {
  expect(nixieSchema.migrations.indexOf(taskMessagesMigration) + 1).toBe(27);
});

test('it keeps each task of a database it upgrades, with a step hop of 0', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('memory-writer', 0, 'waiting', 1, 1, 4, 0, 0, 1, 1)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const rows = await sql`select task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence, step_hop
    from tasks`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      task_id: 'memory-writer',
      is_conversation: 0,
      state: 'waiting',
      read_cursor: 1,
      last_inbox_sequence: 1,
      committed_steps: 4,
      step_errors: 0,
      claimable_at: 0,
      created_sequence: 1,
      updated_sequence: 1,
      step_hop: 0,
    },
  ]);
});

test('it refuses a task message of a kind the tool does not send', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task_message', 'snapshot-a', '{}')`.execute(ctx.db);

  const refused = await sql`insert into task_messages (message_id, from_task, to_task, kind,
    reply_to, wait_state, sent_sequence)
    values ('k3vq8m2xpa', 'memory-writer', 'conversation', 'shout', null, 'none', 1)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
