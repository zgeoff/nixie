import { expect, test } from 'bun:test';
import { startTestBudgets } from '../test-utils';
import { readSpendLedger } from './read-spend-ledger';

test('it lists each budget row in key order with its period', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-month', 'search-day'],
    amountMicros: 12_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const rows = await readSpendLedger(ctx.writer.db);

  expect(rows).toStrictEqual([
    {
      counter: 'budget:search-day',
      unit: 'micros:USD',
      periodKind: 'day',
      periodStart: '2026-10-16',
      amount: 12_000,
    },
    {
      counter: 'budget:search-month',
      unit: 'micros:USD',
      periodKind: 'month',
      periodStart: '2026-10-01',
      amount: 12_000,
    },
  ]);
});

test('it lists nothing before any charge', async () => {
  const ctx = await startTestBudgets();
  const rows = await readSpendLedger(ctx.writer.db);

  expect(rows).toStrictEqual([]);
});
