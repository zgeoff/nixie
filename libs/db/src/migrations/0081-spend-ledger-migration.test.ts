import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { spendLedgerMigration } from './0081-spend-ledger-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-spend-ledger-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  const version = nixieSchema.migrations.indexOf(spendLedgerMigration) + 1;

  return {
    db,
    version,
    migrateTo: (target: number) =>
      runMigrations(db, {
        schema: { migrations: nixieSchema.migrations.slice(0, target), oldestReader: 0 },
        copyDir: directory,
      }),
  };
}

test('it is the migration of version 81, and the oldest reader moves up to it', async () => {
  const ctx = await setupTest();

  expect(ctx.version).toBe(81);
  expect(nixieSchema.oldestReader).toBe(81);
});

test('it carries each count over to the row of its ledger key and drops the old ledger', async () => {
  const ctx = await setupTest();

  await ctx.migrateTo(ctx.version - 1);

  await sql`insert into budgets_in_force (budget_id, counts, limit_micros, period, hash, updated_sequence)
    values ('shopping-week', 'spend', 50000000, 'week', 'h', 3)`.execute(ctx.db);

  await sql`insert into budget_charges
    (charge_id, budget_id, period_start, amount_micros, for_kind, for_id, credited) values
    ('c1', 'shopping-week', '2026-10-12', 4000000, 'action', 'a1', 0),
    ('c2', 'search-day', '2026-10-16', 12000, 'tool_call', 't1', 0),
    ('c3', 'search-month', '2026-10-01', 12000, 'tool_call', 't1', 0)`.execute(ctx.db);

  await sql`insert into budget_ledger (budget_id, period_start, spent_micros) values
    ('shopping-week', '2026-10-12', 4000000),
    ('search-day', '2026-10-16', 12000),
    ('search-month', '2026-10-01', 12000)`.execute(ctx.db);

  await ctx.migrateTo(ctx.version);

  const rows = await sql`select ledger_key, counter, unit, period_kind, period_start, amount
    from spend_ledger order by ledger_key`.execute(ctx.db);

  const keys = await sql`select charge_id, ledger_key from budget_charges
    order by charge_id`.execute(ctx.db);

  const old = await sql`select name from sqlite_master where name = 'budget_ledger'`.execute(
    ctx.db,
  );

  expect([rows.rows, keys.rows, old.rows]).toStrictEqual([
    [
      {
        ledger_key: 'budget:search-day|micros:USD|day|2026-10-16',
        counter: 'budget:search-day',
        unit: 'micros:USD',
        period_kind: 'day',
        period_start: '2026-10-16',
        amount: 12_000,
      },
      {
        ledger_key: 'budget:search-month|micros:USD|month|2026-10-01',
        counter: 'budget:search-month',
        unit: 'micros:USD',
        period_kind: 'month',
        period_start: '2026-10-01',
        amount: 12_000,
      },
      {
        ledger_key: 'budget:shopping-week|micros:USD|week|2026-10-12',
        counter: 'budget:shopping-week',
        unit: 'micros:USD',
        period_kind: 'week',
        period_start: '2026-10-12',
        amount: 4_000_000,
      },
    ],
    [
      { charge_id: 'c1', ledger_key: 'budget:shopping-week|micros:USD|week|2026-10-12' },
      { charge_id: 'c2', ledger_key: 'budget:search-day|micros:USD|day|2026-10-16' },
      { charge_id: 'c3', ledger_key: 'budget:search-month|micros:USD|month|2026-10-01' },
    ],
    [],
  ]);
});
