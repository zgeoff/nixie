import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startTestBudgets } from '../test-utils';
import { readBudgetLedger } from './read-budget-ledger';

test('it lists the charges of the period in force, oldest first, with the credited ones marked', async () => {
  const ctx = await startTestBudgets();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 1_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 2_000_000,
    for: { kind: 'action', id: 'action-1' },
  });

  await ctx.credit({ for: { kind: 'tool_call', id: 'call-1' } });

  const firstDayMs = ctx.clock.now();

  ctx.clock.advance(24 * 60 * 60 * 1000);

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 3_000_000,
    for: { kind: 'tool_call', id: 'call-2' },
  });

  // the test clock never runs backwards, so the ledger is read at the first day on a clock of its own
  const firstDayContext = { ...ctx.context, clock: createFakeClock({ startMs: firstDayMs }) };

  const ledger = await readBudgetLedger(ctx.writer.db, firstDayContext, 'search-day');

  expect(ledger).toStrictEqual({
    budgetID: 'search-day',
    periodStart: '2026-10-16',
    resetsAt: Date.parse('2026-10-17T00:00:00Z'),
    spentMicros: 2_000_000,
    charges: [
      {
        chargeID: expect.any(String),
        amountMicros: 1_000_000,
        for: { kind: 'tool_call', id: 'call-1' },
        isCredited: true,
      },
      {
        chargeID: expect.any(String),
        amountMicros: 2_000_000,
        for: { kind: 'action', id: 'action-1' },
        isCredited: false,
      },
    ],
  });
});

test('it returns null for a budget that no one defines', async () => {
  const ctx = await startTestBudgets();
  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'pet-month');

  expect(ledger).toBeNull();
});
