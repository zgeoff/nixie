import { expect, test } from 'bun:test';
import { startTestBudgets } from './start-test-budgets';

test('it starts at 09:00 UTC on Friday 16 October 2026 with the built-in budgets of search', async () => {
  const ctx = await startTestBudgets();

  expect(ctx.clock.now()).toBe(Date.parse('2026-10-16T09:00:00Z'));
  expect(ctx.context.zone).toBe('UTC');

  expect(ctx.context.builtIn.map((budget) => budget.id)).toStrictEqual([
    'search-day',
    'search-month',
  ]);
});
