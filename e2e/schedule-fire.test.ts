import { expect, test } from 'bun:test';
import { runOracle, startSpawnedNixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startSpawnedNixie({
    taskDefinitions: [
      {
        id: 'water-the-tomatoes',
        yaml: [
          'name: Water the tomatoes',
          'brief: Water the tomatoes in the greenhouse and report when done.',
          'trigger:',
          '  schedule:',
          '    every:',
          '      minutes: 5',
          '',
        ].join('\n'),
        instructions: 'Keep the report to one line.\n',
      },
    ],
  });

  return { nixie };
}

test('it fires a 5-minute schedule once and runs its task to a report', async () => {
  const ctx = await setupTest();

  const child = ctx.nixie.harness.start();

  await child.ready;

  await ctx.nixie.waitForQueueCheck();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The tomatoes are watered.' } },
    },
    { text: 'Done.' },
  );

  await ctx.nixie.harness.advance(300_000, { settle: true });

  const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

  const report = await ctx.nixie.waitForRecord(
    (record) =>
      record.kind === 'task_message' &&
      record.payload['kind'] === 'report' &&
      record.payload['from'] === fired.thread,
  );

  await child.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(records.filter((record) => record.kind === 'trigger.fired')).toHaveLength(1);

  expect(fired.payload).toMatchObject({
    definitionID: 'water-the-tomatoes',
    source: 'schedule',
    kind: 'schedule',
    scheduledFor: '1970-01-01T00:20:00.000Z',
    isCatchUp: true,
  });

  expect(report.payload['to']).toBe('conversation');

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});
