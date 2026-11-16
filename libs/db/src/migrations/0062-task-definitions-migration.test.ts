import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { taskDefinitionsMigration } from './0062-task-definitions-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-task-definitions-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1, 'task.created', 'h', '{}')`.execute(db);

  return {
    db,
    buildInsert: (taskID: string, definitionID: string | null) =>
      sql`insert into tasks (task_id, is_conversation, state, read_cursor, last_inbox_sequence,
          committed_steps, step_errors, claimable_at, step_hop, pause_requested, created_sequence,
          updated_sequence, definition_id)
        values (${taskID}, 0, 'waiting', 0, 0, 0, 0, 0, 0, 0, 1, 1, ${definitionID})`,
  };
}

test('it is the migration of version 61', () => {
  expect(nixieSchema.migrations.indexOf(taskDefinitionsMigration) + 1).toBe(62);
});

test('it leaves the definition columns of a task empty', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('t4m2', null).execute(ctx.db);

  const rows = await sql`select definition_id, definition_hash from tasks`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ definition_id: null, definition_hash: null }]);
});

test('it refuses a second task for one definition', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('t4m2', 'water-plants').execute(ctx.db);

  const second = ctx.buildInsert('t5n3', 'water-plants').execute(ctx.db);

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('it allows many tasks with no definition', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('t4m2', null).execute(ctx.db);
  await ctx.buildInsert('t5n3', null).execute(ctx.db);

  const rows = await sql`select task_id from tasks order by task_id`.execute(ctx.db);

  expect(rows.rows).toHaveLength(2);
});
