import { expect, test } from 'bun:test';
import { seedBudgetRecords } from './seed-budget-records';
import { startInProcessNixie } from './start-in-process-nixie';

test('it writes 2 charges and a credit that the server starts on', async () => {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: (files) => seedBudgetRecords(files),
  });

  await nixie.waitForLogEvent('ready');

  nixie.signalStop();

  const stopped = await nixie.waitForExit();

  const kinds = stopped.records
    .map((record) => record.kind)
    .filter((kind) => kind.startsWith('budget.'));

  expect(kinds).toStrictEqual(['budget.charged', 'budget.charged', 'budget.credited']);
});
