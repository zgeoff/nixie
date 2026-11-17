import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { budgetsMigration } from './0071-budgets-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-budgets-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(budgetsMigration) + 1,
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it is the migration of version 71, and it leaves the oldest reader at 70', () => {
  expect(nixieSchema.migrations.indexOf(budgetsMigration) + 1).toBe(71);
  expect(nixieSchema.oldestReader).toBe(70);
});

test('it creates the 3 budget tables empty', async () => {
  const ctx = await setupTest();

  const tables = await sql`select name from sqlite_master
    where type = 'table' and name like 'budget%' order by name`.execute(ctx.db);

  expect(tables.rows).toStrictEqual([
    { name: 'budget_charges' },
    { name: 'budget_ledger' },
    { name: 'budgets_in_force' },
  ]);
});

test('it refuses a charge of no money', async () => {
  const ctx = await setupTest();

  const insert = sql`insert into budget_charges
    (charge_id, budget_id, period_start, amount_micros, for_kind, for_id)
    values ('a', 'b', '2026-11-17', 0, 'action', 'x')`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toThrowWithMessage(Error, /CHECK constraint failed/u);
});
