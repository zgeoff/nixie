import { expect, test } from 'bun:test';
import { readBudgetsInForce } from '../limit/read-budgets-in-force';
import { startTestBudgets } from './start-test-budgets';

test('it puts a budget in force, which the reader of the budgets in force returns', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedBudgetInForce({
    id: 'shopping-month',
    counts: 'spend',
    limitMicros: 100_000_000,
    period: 'month',
  });

  const inForce = await readBudgetsInForce(ctx.writer.db);

  expect(inForce).toStrictEqual([
    { id: 'shopping-month', counts: 'spend', limitMicros: 100_000_000, period: 'month' },
  ]);
});
