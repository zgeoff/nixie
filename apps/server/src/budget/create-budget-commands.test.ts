import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { runHostCommand } from '../test-utils/run-host-command';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie({
    hasStarterRules: false,
    beforeStart: async (files) => {
      const definitions = join(dirname(files.configPath), 'definitions');

      await writeFile(join(definitions, 'nixie.yaml'), 'format: 5\n');
      await mkdir(join(definitions, 'budgets'));

      await writeFile(
        join(definitions, 'budgets', 'start.yaml'),
        'groceries:\n  counts: spend\n  limit: 80\n  period: week\n',
      );
    },
  });

  await nixie.waitForLogEvent('ready');

  return nixie;
}

test('it lists each budget in force, built-in ones too, with its limit, period, spent and reset', async () => {
  const ctx = await setupTest();
  const listed = await runHostCommand(ctx.configPath, ['budgets', 'list']);

  expect({
    exitCode: listed.exitCode,
    budgets: z.array(z.unknown()).parse(JSON.parse(listed.stdout)),
  }).toStrictEqual({
    exitCode: 0,
    budgets: [
      {
        budgetID: 'groceries',
        counts: 'spend',
        limitMicros: 80_000_000,
        period: 'week',
        spentMicros: 0,
        resetsAt: expect.any(String),
        source: 'definitions',
      },
      {
        budgetID: 'image.draw-day',
        counts: 'tool:image.draw',
        limitMicros: 2_000_000,
        period: 'day',
        spentMicros: 0,
        resetsAt: expect.any(String),
        source: 'built_in',
      },
      {
        budgetID: 'image.draw-month',
        counts: 'tool:image.draw',
        limitMicros: 20_000_000,
        period: 'month',
        spentMicros: 0,
        resetsAt: expect.any(String),
        source: 'built_in',
      },
      {
        budgetID: 'search-day',
        counts: 'tool:search',
        limitMicros: 5_000_000,
        period: 'day',
        spentMicros: 0,
        resetsAt: expect.any(String),
        source: 'built_in',
      },
      {
        budgetID: 'search-month',
        counts: 'tool:search',
        limitMicros: 50_000_000,
        period: 'month',
        spentMicros: 0,
        resetsAt: expect.any(String),
        source: 'built_in',
      },
    ],
  });
});

test('it prints the ledger of a budget, with no charge before its first purchase', async () => {
  const ctx = await setupTest();
  const ledger = await runHostCommand(ctx.configPath, ['budgets', 'ledger', 'groceries']);

  const printed = z
    .object({ budgetID: z.string(), spentMicros: z.number(), charges: z.array(z.unknown()) })
    .parse(JSON.parse(ledger.stdout));

  expect({ exitCode: ledger.exitCode, printed }).toStrictEqual({
    exitCode: 0,
    printed: { budgetID: 'groceries', spentMicros: 0, charges: [] },
  });
});

test('it refuses the ledger of a budget that no one defines', async () => {
  const ctx = await setupTest();
  const ledger = await runHostCommand(ctx.configPath, ['budgets', 'ledger', 'missing']);

  expect({ exitCode: ledger.exitCode, stdout: ledger.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: '',
  });
});
