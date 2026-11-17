import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { spendMigrationVersion } from '../migration/spend-migration-version';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { spendStopMigration } from './0068-spend-stop-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-spend-stop-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(spendStopMigration) + 1,
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it is the migration of version 68, which spendMigrationVersion names', () => {
  expect(nixieSchema.migrations.indexOf(spendStopMigration) + 1).toBe(68);
  expect(spendMigrationVersion).toBe(68);
});

test('it creates the 4 spend tables', async () => {
  const ctx = await setupTest();

  const tables = await sql`select name from sqlite_master
    where type = 'table' and name like 'spend_%' order by name`.execute(ctx.db);

  expect(tables.rows).toStrictEqual([
    { name: 'spend_raises' },
    { name: 'spend_stop' },
    { name: 'spend_turns' },
    { name: 'spend_turns_folded' },
  ]);
});

test('it refuses a spend stop row with an id other than 1', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into spend_stop (id, reason, at, updated_sequence)
    values (2, 'lost', 1, 1)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toThrowWithMessage(Error, /CHECK constraint failed/u);
});
