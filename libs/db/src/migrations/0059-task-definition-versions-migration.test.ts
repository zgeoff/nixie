import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { taskDefinitionVersionsMigration } from './0059-task-definition-versions-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-task-definition-versions-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it is the migration of version 59', () => {
  expect(nixieSchema.migrations.indexOf(taskDefinitionVersionsMigration) + 1).toBe(59);
});

test('it creates the table of task definition versions', async () => {
  const ctx = await setupTest();

  await sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
    values ('hash-1', 'water-plants', '{}', '{}')`.execute(ctx.db);

  const rows =
    await sql`select definition_hash, definition_id from task_definition_versions`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ definition_hash: 'hash-1', definition_id: 'water-plants' }]);
});

test('it refuses a second version with the same hash', async () => {
  const ctx = await setupTest();

  await sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
    values ('hash-1', 'water-plants', '{}', '{}')`.execute(ctx.db);

  const insert =
    sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
    values ('hash-1', 'water-plants', '{}', '{}')`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
});
