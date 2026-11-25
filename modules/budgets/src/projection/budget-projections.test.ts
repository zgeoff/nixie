import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readTestProjectionDrift } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { budgetChargedCodec } from '../record/budget-charged-codec';
import { startTestBudgets } from '../test-utils';
import { budgetProjections } from './budget-projections';

test('it lists the ledger before the charges, because a credit reads its charge', () => {
  expect(budgetProjections.map((projection) => projection.table)).toStrictEqual([
    'spend_ledger',
    'budget_charges',
  ]);
});

test('it folds a charge into its row and into the ledger of its period', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 25_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 5000,
    for: { kind: 'action', id: 'action-1' },
  });

  const charges =
    await sql`select budget_id, period_start, amount_micros, for_kind, for_id, credited, ledger_key
    from budget_charges order by rowid`.execute(ctx.writer.db);

  const ledger = await sql`select * from spend_ledger`.execute(ctx.writer.db);

  expect(charges.rows).toStrictEqual([
    {
      budget_id: 'search-day',
      period_start: '2026-10-16',
      amount_micros: 25_000,
      for_kind: 'tool_call',
      for_id: 'call-1',
      credited: 0,
      ledger_key: 'budget:search-day|micros:USD|day|2026-10-16',
    },
    {
      budget_id: 'search-day',
      period_start: '2026-10-16',
      amount_micros: 5000,
      for_kind: 'action',
      for_id: 'action-1',
      credited: 0,
      ledger_key: 'budget:search-day|micros:USD|day|2026-10-16',
    },
  ]);

  expect(ledger.rows).toStrictEqual([
    {
      ledger_key: 'budget:search-day|micros:USD|day|2026-10-16',
      counter: 'budget:search-day',
      unit: 'micros:USD',
      period_kind: 'day',
      period_start: '2026-10-16',
      amount: 30_000,
    },
  ]);
});

test('it marks a credited charge and lowers the ledger by its amount', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 25_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  await ctx.credit({ for: { kind: 'tool_call', id: 'call-1' } });

  const charges = await sql`select credited from budget_charges`.execute(ctx.writer.db);
  const ledger = await sql`select amount from spend_ledger`.execute(ctx.writer.db);

  expect(charges.rows).toStrictEqual([{ credited: 1 }]);
  expect(ledger.rows).toStrictEqual([{ amount: 0 }]);
});

test('it rebuilds to the same rows that the live fold wrote', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day', 'search-month'],
    amountMicros: 25_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 5000,
    for: { kind: 'tool_call', id: 'call-2' },
  });

  await ctx.credit({ for: { kind: 'tool_call', id: 'call-1' } });

  const drift = await readTestProjectionDrift(ctx.log);

  expect(drift).toStrictEqual([]);
});

test('it credits the row its charge added to after the budget changes its period', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 25_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  await ctx.seedBudgetInForce({
    id: 'search-day',
    counts: 'tool:search',
    limitMicros: 5_000_000,
    period: 'month',
  });

  await ctx.credit({ for: { kind: 'tool_call', id: 'call-1' } });

  const ledger = await sql`select ledger_key, amount from spend_ledger`.execute(ctx.writer.db);

  expect(ledger.rows).toStrictEqual([
    { ledger_key: 'budget:search-day|micros:USD|day|2026-10-16', amount: 0 },
  ]);
});

test('it keys a charge that names no ledger key by the period kind of its budget', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedBudgetInForce({
    id: 'shopping-week',
    counts: 'spend',
    limitMicros: 100_000_000,
    period: 'week',
  });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(tx, ctx.log, [
      {
        kind: budgetChargedCodec.kind,
        definitions: ctx.context.definitions(),
        payload: budgetChargedCodec.encode({
          chargeID: 'old-charge',
          budgetID: 'shopping-week',
          periodStart: '2026-10-12',
          amountMicros: 4_000_000,
          for: { kind: 'action', id: 'action-1' },
        }),
      },
    ]),
  );

  const ledger = await sql`select ledger_key, amount from spend_ledger`.execute(ctx.writer.db);

  expect(ledger.rows).toStrictEqual([
    { ledger_key: 'budget:shopping-week|micros:USD|week|2026-10-12', amount: 4_000_000 },
  ]);
});
