import { expect, test } from 'bun:test';
import { readTestProjectionDrift } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { startTestBudgets } from '../test-utils';
import { budgetProjections } from './budget-projections';

test('it lists the ledger before the charges, because a credit reads its charge', () => {
  expect(budgetProjections.map((projection) => projection.table)).toStrictEqual([
    'budget_ledger',
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
    await sql`select budget_id, period_start, amount_micros, for_kind, for_id, credited
    from budget_charges order by rowid`.execute(ctx.writer.db);

  const ledger = await sql`select * from budget_ledger`.execute(ctx.writer.db);

  expect(charges.rows).toStrictEqual([
    {
      budget_id: 'search-day',
      period_start: '2026-10-16',
      amount_micros: 25_000,
      for_kind: 'tool_call',
      for_id: 'call-1',
      credited: 0,
    },
    {
      budget_id: 'search-day',
      period_start: '2026-10-16',
      amount_micros: 5000,
      for_kind: 'action',
      for_id: 'action-1',
      credited: 0,
    },
  ]);

  expect(ledger.rows).toStrictEqual([
    { budget_id: 'search-day', period_start: '2026-10-16', spent_micros: 30_000 },
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
  const ledger = await sql`select spent_micros from budget_ledger`.execute(ctx.writer.db);

  expect(charges.rows).toStrictEqual([{ credited: 1 }]);
  expect(ledger.rows).toStrictEqual([{ spent_micros: 0 }]);
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
