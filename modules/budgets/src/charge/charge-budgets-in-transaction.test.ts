import { expect, test } from 'bun:test';
import { readBudgetLedger } from '../read/read-budget-ledger';
import { startTestBudgets } from '../test-utils';

test('it charges the day and the month budget in one transaction, and returns a charge ID for each', async () => {
  const ctx = await startTestBudgets();

  const result = await ctx.charge({
    budgetIDs: ['search-day', 'search-month'],
    amountMicros: 25_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const day = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');
  const month = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-month');

  expect(result).toStrictEqual({ chargeIDs: [expect.any(String), expect.any(String)] });
  expect(day).toMatchObject({ periodStart: '2026-10-16', spentMicros: 25_000 });
  expect(month).toMatchObject({ periodStart: '2026-10-01', spentMicros: 25_000 });
});

test('it lets a charge fill a budget to its limit exactly', async () => {
  const ctx = await startTestBudgets();

  const result = await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 5_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  expect(result).toStrictEqual({ chargeIDs: [expect.any(String)] });
});

test('it writes nothing when one of 2 budgets is full', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedBudgetInForce({
    id: 'search-month',
    counts: 'tool:search',
    limitMicros: 100_000,
    period: 'month',
  });

  await ctx.charge({
    budgetIDs: ['search-month'],
    amountMicros: 90_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const result = await ctx.charge({
    budgetIDs: ['search-day', 'search-month'],
    amountMicros: 25_000,
    for: { kind: 'tool_call', id: 'call-2' },
  });

  const day = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');
  const month = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-month');

  expect(result).toStrictEqual({
    error: 'budget_reached',
    budgetID: 'search-month',
    period: 'month',
    spentMicros: 90_000,
    limitMicros: 100_000,
    resetsAt: Date.parse('2026-11-01T00:00:00Z'),
    resetsOn: '2026-11-01',
  });

  expect(day).toMatchObject({ spentMicros: 0, charges: [] });
  expect(month).toMatchObject({ spentMicros: 90_000 });
});

test('it never lets 2 charges at the same moment both fit in the last of a budget', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 4_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const results = await Promise.all([
    ctx.charge({
      budgetIDs: ['search-day'],
      amountMicros: 600_000,
      for: { kind: 'tool_call', id: 'call-2' },
    }),
    ctx.charge({
      budgetIDs: ['search-day'],
      amountMicros: 600_000,
      for: { kind: 'tool_call', id: 'call-3' },
    }),
  ]);

  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');

  expect(results.filter((result) => 'chargeIDs' in result)).toHaveLength(1);
  expect(results.filter((result) => 'error' in result)).toHaveLength(1);
  expect(ledger?.spentMicros).toBe(4_600_000);
});

test('it charges a new period from zero when the old one ends', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 5_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  ctx.clock.advance(24 * 60 * 60 * 1000);

  const result = await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 5_000_000,
    for: { kind: 'tool_call', id: 'call-2' },
  });

  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');

  expect(result).toStrictEqual({ chargeIDs: [expect.any(String)] });
  expect(ledger).toMatchObject({ periodStart: '2026-10-17', spentMicros: 5_000_000 });
});

test('it refuses a budget that no one defines, and writes nothing', async () => {
  const ctx = await startTestBudgets();

  const result = await ctx.charge({
    budgetIDs: ['search-day', 'pet-month'],
    amountMicros: 1000,
    for: { kind: 'action', id: 'action-1' },
  });

  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');

  expect(result).toStrictEqual({ error: 'budget_unknown', budgetID: 'pet-month' });
  expect(ledger?.spentMicros).toBe(0);
});

test('it takes the limit of a budget in force over the built-in one', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedBudgetInForce({
    id: 'search-day',
    counts: 'tool:search',
    limitMicros: 1_000_000,
    period: 'day',
  });

  const result = await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 1_500_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  expect(result).toMatchObject({ error: 'budget_reached', limitMicros: 1_000_000 });
});
