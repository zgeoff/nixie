import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { runtimeTaskDefinitionsMigration } from './0065-runtime-task-definitions-migration';

interface ChangeRow {
  readonly changeID: string;
  readonly shortID: string;
  readonly state: string;
}

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-runtime-tasks-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return {
    db,
    writeChange: (change: ChangeRow) =>
      sql`insert into runtime_task_definitions
        (change_id, short_id, definition_id, operation, caller, state, changed_sequence, updated_sequence)
        values (${change.changeID}, ${change.shortID}, 'water-the-tomatoes', 'add', 'conversation',
          ${change.state}, 1, 1)`.execute(db),
  };
}

test('it is the migration of version 65', () => {
  expect(nixieSchema.migrations.indexOf(runtimeTaskDefinitionsMigration) + 1).toBe(65);
});

test('it creates the 2 tables empty', async () => {
  const ctx = await setupTest();

  const names = await sql`select name from sqlite_master
    where type = 'table' and (name like 'runtime_task_%' or name like 'task_definition_exports')
    order by name`.execute(ctx.db);

  expect(names.rows).toStrictEqual([
    { name: 'runtime_task_definitions' },
    { name: 'task_definition_exports' },
  ]);
});

test('it refuses a second change in force for one definition', async () => {
  const ctx = await setupTest();

  await ctx.writeChange({ changeID: 'c1', shortID: 'a1', state: 'in_force' });

  const second = ctx.writeChange({ changeID: 'c2', shortID: 'a2', state: 'in_force' });

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('it accepts a change in force beside a superseded one', async () => {
  const ctx = await setupTest();

  await ctx.writeChange({ changeID: 'c1', shortID: 'a1', state: 'superseded' });
  await ctx.writeChange({ changeID: 'c2', shortID: 'a2', state: 'in_force' });

  const rows = await sql`select change_id from runtime_task_definitions
    order by change_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ change_id: 'c1' }, { change_id: 'c2' }]);
});

test('it refuses a second change with one short ID', async () => {
  const ctx = await setupTest();

  await ctx.writeChange({ changeID: 'c1', shortID: 'a1', state: 'superseded' });

  const second = ctx.writeChange({ changeID: 'c2', shortID: 'a1', state: 'superseded' });

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('it keeps the rows when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.writeChange({ changeID: 'c1', shortID: 'a1', state: 'in_force' });
  await ctx.db.transaction().execute((tx) => runtimeTaskDefinitionsMigration.up(tx));

  const rows = await sql`select change_id from runtime_task_definitions`.execute(ctx.db);

  expect(rows.rows).toHaveLength(1);
});
