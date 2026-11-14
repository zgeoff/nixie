import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from '../build-sqlite-worker-dialect';
import { nixieSchema } from '../nixie-schema';
import { runMigrations } from '../run-migrations';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { turnInputsMigration } from './0044-turn-inputs-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-turn-inputs-migration-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it moves the schema to version 44, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(turnInputsMigration) + 1).toBe(44);
  expect(nixieSchema.oldestReader).toBe(35);
});

test('it refuses a capture state outside open and closed', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into turn_input_captures
    (capture_id, task_id, step_run_id, role, profile, model, harness, source, state, opened_at)
    values ('c', 't', 's', 'task', 'p', 'm', 'agent-sdk', 'gateway', 'paused', 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it refuses a miss with a count of 0', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into turn_input_misses
    (miss_id, task_id, step_run_id, reason, count, created_at)
    values ('m', 't', 's', 'not_received', 0, 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it refuses a second request with the same capture, writer and counter', async () => {
  const ctx = await setupTest();

  await sql`insert into turn_input_captures
    (capture_id, task_id, step_run_id, role, profile, model, harness, source, state, opened_at)
    values ('c', 't', 's', 'task', 'p', 'm', 'agent-sdk', 'gateway', 'open', 1)`.execute(ctx.db);

  const insertInput = (inputID: string) =>
    sql`insert into turn_inputs
      (input_id, capture_id, task_id, step_run_id, writer, counter, role, profile, model, harness,
       api, endpoint, route, is_rewritten, upstream_status, bytes, key_id, intake_sequence,
       received_at, taken_at, state)
      values (${inputID}, 'c', 't', 's', 'ab', 1, 'task', 'p', 'm', 'agent-sdk', 'anthropic',
       'messages', 'r', 0, 200, 10, 'k', 1, 1, 1, 'writing')`.execute(ctx.db);

  await insertInput('a');

  const second = insertInput('b');

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('it runs up a second time with no error and no change to the tables', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => turnInputsMigration.up(tx));

  const tables =
    await sql`select name from sqlite_schema where name like 'turn_input%' and type = 'table' order by name`.execute(
      ctx.db,
    );

  expect(tables.rows).toStrictEqual([
    { name: 'turn_input_captures' },
    { name: 'turn_input_misses' },
    { name: 'turn_inputs' },
  ]);
});
