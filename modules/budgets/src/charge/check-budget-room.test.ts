import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readBudgetLedger } from '../read/read-budget-ledger';
import { startTestBudgets } from '../test-utils';
import { checkBudgetRoom } from './check-budget-room';

async function setupTest() {
  const ctx = await startTestBudgets();

  return {
    ...ctx,
    check: (amountMicros: number) =>
      withWriteTransaction(ctx.writer, (tx) =>
        checkBudgetRoom(tx, ctx.context, {
          budgetIDs: ['search-day', 'search-month'],
          amountMicros,
        }),
      ),
  };
}

test('it finds room for an amount that fits, and writes no charge', async () => {
  const ctx = await setupTest();
  const found = await ctx.check(5_000_000);
  const ledger = await readBudgetLedger(ctx.writer.db, ctx.context, 'search-day');

  expect([found, ledger?.spentMicros]).toStrictEqual([null, 0]);
});

test('it names the budget that lacks room for the amount', async () => {
  const ctx = await setupTest();

  await ctx.charge({
    budgetIDs: ['search-day'],
    amountMicros: 4_000_000,
    for: { kind: 'tool_call', id: 'call-1' },
  });

  const found = await ctx.check(1_000_001);

  expect(found).toMatchObject({ error: 'budget_reached', budgetID: 'search-day' });
});

test('it names a budget that no one defines', async () => {
  const ctx = await startTestBudgets();

  const found = await withWriteTransaction(ctx.writer, (tx) =>
    checkBudgetRoom(tx, ctx.context, { budgetIDs: ['nothing-day'], amountMicros: 1 }),
  );

  expect(found).toStrictEqual({ error: 'budget_unknown', budgetID: 'nothing-day' });
});
