import { expect, test } from 'bun:test';
import { readHostLedger } from './read-host-ledger';
import { seedPaidBudgetSpend } from './seed-paid-budget-spend';
import { startInProcessNixie } from './start-in-process-nixie';

test('it writes one charge to a built-in budget that the server starts on', async () => {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: (files) =>
      seedPaidBudgetSpend(files, {
        tool: 'search',
        budgetID: 'search-day',
        amountMicros: 5_000_000,
      }),
  });

  await nixie.waitForLogEvent('ready');

  const day = await readHostLedger(nixie.configPath, 'search-day');
  const month = await readHostLedger(nixie.configPath, 'search-month');

  expect(day.spentMicros).toBe(5_000_000);
  expect(month.spentMicros).toBe(0);
});
