import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { taskRunsMigration } from './0050-task-runs-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-task-runs-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1, 'task.run_opened', 'h', '{}')`.execute(db);

  return {
    db,
    buildInsert: (runID: string, taskID: string) =>
      sql`insert into task_runs (run_id, task_id, opened_sequence, started_at, opened)
        values (${runID}, ${taskID}, 1, 1, '{}')`,
  };
}

test('it keeps the migration at the version that adds the table', () => {
  expect(nixieSchema.migrations.indexOf(taskRunsMigration) + 1).toBe(50);
});

test('it refuses a second open task run of one task', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('run-a', 't4m2').execute(ctx.db);

  const second = await ctx
    .buildInsert('run-b', 't4m2')
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(second).toBeInstanceOf(Error);
});

test('it takes a second open task run of another task', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('run-a', 't4m2').execute(ctx.db);
  await ctx.buildInsert('run-b', 'k9d3').execute(ctx.db);

  const rows = await sql`select run_id from task_runs order by run_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ run_id: 'run-a' }, { run_id: 'run-b' }]);
});

test('it takes a new open task run once the earlier one ended', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('run-a', 't4m2').execute(ctx.db);

  await sql`update task_runs set ended_sequence = 1, ended_at = 2, ended = '{}'
    where run_id = 'run-a'`.execute(ctx.db);

  await ctx.buildInsert('run-b', 't4m2').execute(ctx.db);

  const rows = await sql`select run_id from task_runs order by run_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ run_id: 'run-a' }, { run_id: 'run-b' }]);
});

test('it refuses an ended task run that holds no end record', async () => {
  const ctx = await setupTest();

  await ctx.buildInsert('run-a', 't4m2').execute(ctx.db);

  const refused = await sql`update task_runs set ended_sequence = 1 where run_id = 'run-a'`
    .execute(ctx.db)
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toBeInstanceOf(Error);
});
