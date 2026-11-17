import { expect, test } from 'bun:test';
import { startTestBudgets } from '../test-utils';
import { readBudgetStatuses } from './read-budget-statuses';

test('it lists a built-in budget with nothing spent, and a budget in force that replaces one', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedBudgetInForce({
    id: 'search-day',
    counts: 'tool:search',
    limitMicros: 2_000_000,
    period: 'day',
  });

  await ctx.seedBudgetInForce({
    id: 'shopping-week',
    counts: 'spend',
    limitMicros: 100_000_000,
    period: 'week',
  });

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 500_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const statuses = await readBudgetStatuses(ctx.writer.db, ctx.context);

  expect(statuses).toStrictEqual([
    {
      id: 'search-day',
      counts: 'tool:search',
      limitMicros: 2_000_000,
      period: 'day',
      spentMicros: 500_000,
      periodStart: '2026-10-16',
      resetsAt: Date.parse('2026-10-17T00:00:00Z'),
      source: 'definitions',
    },
    {
      id: 'search-month',
      counts: 'tool:search',
      limitMicros: 50_000_000,
      period: 'month',
      spentMicros: 0,
      periodStart: '2026-10-01',
      resetsAt: Date.parse('2026-11-01T00:00:00Z'),
      source: 'built_in',
    },
    {
      id: 'shopping-week',
      counts: 'spend',
      limitMicros: 100_000_000,
      period: 'week',
      spentMicros: 0,
      periodStart: '2026-10-12',
      resetsAt: Date.parse('2026-10-19T00:00:00Z'),
      source: 'definitions',
    },
  ]);
});
