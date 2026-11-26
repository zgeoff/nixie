import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readChargeLedgerKey } from '../ledger/read-charge-ledger-key';
import { startTestBudgets } from './start-test-budgets';

test('it keeps a kind, which the key of its charge takes in place of the budget in force', async () => {
  const ctx = await startTestBudgets();

  await ctx.seedBudgetInForce({
    id: 'groceries',
    counts: 'spend',
    limitMicros: 100_000_000,
    period: 'month',
  });

  await ctx.seedLegacyChargeKind('old-charge', 'week');

  const key = await withWriteTransaction(ctx.writer, (tx) =>
    readChargeLedgerKey(tx, {
      chargeID: 'old-charge',
      budgetID: 'groceries',
      periodStart: '2026-10-12',
    }),
  );

  expect(key).toBe('budget:groceries|micros:USD|week|2026-10-12');
});
