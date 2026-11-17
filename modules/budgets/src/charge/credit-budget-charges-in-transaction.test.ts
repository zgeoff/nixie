import { expect, test } from 'bun:test';
import { readBudgetLedger } from '../read/read-budget-ledger';
import { startTestBudgets } from '../test-utils';

test('it credits every charge of a call and gives its room back', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day', 'search-month'],
    amountMicros: 3_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const credited = await ctx.credit({ for: { kind: 'tool_call', id: 'call-1' } });
  const day = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');
  const month = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-month');

  expect(credited).toBe(2);
  expect(day).toMatchObject({ spentMicros: 0 });
  expect(month).toMatchObject({ spentMicros: 0 });
});

test('it credits a charge once, whatever the number of calls', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 3_000_000,
    for: { kind: 'action', id: 'action-1' },
  });

  await ctx.credit({ for: { kind: 'action', id: 'action-1' } });

  const again = await ctx.credit({ for: { kind: 'action', id: 'action-1' } });
  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');

  expect(again).toBe(0);
  expect(ledger?.spentMicros).toBe(0);
});

test('it credits only the charges of the call it names', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 1_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 2_000_000,
    for: { kind: 'tool_call', id: 'call-2' },
  });

  await ctx.credit({ for: { kind: 'tool_call', id: 'call-1' } });

  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');

  expect(ledger?.spentMicros).toBe(2_000_000);
});

test('it credits nothing for a call that charged nothing', async () => {
  const ctx = await startTestBudgets();
  const credited = await ctx.credit({ for: { kind: 'tool_call', id: 'none' } });

  expect(credited).toBe(0);
});
