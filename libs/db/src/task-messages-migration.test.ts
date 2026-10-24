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

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 27', () => {
  expect(nixieSchema.migrations.indexOf(taskMessagesMigration) + 1).toBe(27);
});

test('it gives a task created before the migration a step hop of 0', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task.created', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('memory-writer', 0, 'ready', 0, 0, 0, 0, 0, 1, 1)`.execute(ctx.db);

  const row = await sql`select step_hop from tasks`.execute(ctx.db);

  expect(row.rows).toStrictEqual([{ step_hop: 0 }]);
});

test('it refuses a task message of a kind the tool does not send', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'task_message', 'snapshot-a', '{}')`.execute(ctx.db);

  const refused = await sql`insert into task_messages (message_id, from_task, to_task, kind,
    reply_to, is_waiting, sent_sequence)
    values ('k3vq8m2xpa', 'memory-writer', 'conversation', 'shout', null, 0, 1)`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
