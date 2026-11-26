import { expect, test } from 'bun:test';
import { systemClock } from '@heynixie/clock';
import { readRecords } from '@heynixie/log';
import { seedUncheckedRuleApprovals } from './seed-unchecked-rule-approvals';
import { startDataLog } from './start-data-log';
import { startInProcessNixie } from './start-in-process-nixie';

async function setupTest() {
  const seeded = Promise.withResolvers<readonly (readonly [unknown, unknown])[]>();

  const nixie = await startInProcessNixie({
    hasStarterRules: false,

    // reads the family and outcome of each settled proposal before nixie starts
    beforeStart: async (files) => {
      await seedUncheckedRuleApprovals(files);

      const data = await startDataLog({ ...files, clock: systemClock });

      const settled = await readRecords(data.context.log, {
        afterSequence: 0,
        kinds: ['proposals.settled'],
      });

      await data.writer.stop();

      seeded.resolve(
        settled.map(
          (entry) => [entry.record.payload['family'], entry.record.payload['outcome']] as const,
        ),
      );
    },
  });

  const settled = await seeded.promise;

  return { nixie, settled };
}

test('it leaves 3 approved sends and proposes no rule before nixie starts', async () => {
  const ctx = await setupTest();

  expect(ctx.settled).toStrictEqual([
    ['action', 'approved'],
    ['action', 'approved'],
    ['action', 'approved'],
  ]);
});

test('it leaves the rule check of the sends to the next start', async () => {
  const ctx = await setupTest();

  await ctx.nixie.waitForLogEvent('ready');

  ctx.nixie.signalStop();

  const exit = await ctx.nixie.waitForExit();

  const families = exit.records
    .filter((record) => record.kind === 'proposals.proposed')
    .map((record) => record.payload['family']);

  expect(families).toStrictEqual(['action', 'action', 'action', 'rule_change']);
});
