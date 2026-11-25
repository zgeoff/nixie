import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { actionRefusalsMigration } from './0081-action-refusals-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-action-refusals-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(actionRefusalsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 81', () => {
  expect(nixieSchema.migrations.indexOf(actionRefusalsMigration) + 1).toBe(81);
});

test('it adds no refusal and no runner mark to an action it upgrades', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'action.queued', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
    committed_steps, step_errors, claimable_at, created_sequence, updated_sequence)
    values ('h7q2m9x4ka', 0, 'waiting', 1, 1, 2, 0, 0, 1, 1)`.execute(ctx.db);

  await sql`insert into actions (action_id, task_id, step_key, action_hash, tool, status,
    attempt_count, attempt_open, next_attempt_at, queued_sequence, updated_sequence, risk_class,
    is_approved, unknown_streak)
    values ('4f1d2c8e-7a60-4b3d-9e15-0a2b6c8d1f37', 'h7q2m9x4ka', 'step-1', 'sha256:a', 'mail.send',
    'pending', 0, 0, 0, 1, 1, 'routine', 0, 0)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const rows = await sql`select refused_count, is_runner from actions`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ refused_count: 0, is_runner: 0 }]);
});

test('it keeps each count when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await ctx.db.transaction().execute((tx) => actionRefusalsMigration.up(tx));

  const columns = await sql`
    select name from pragma_table_info('actions') where name in ('refused_count', 'is_runner')
    order by name`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([{ name: 'is_runner' }, { name: 'refused_count' }]);
});
