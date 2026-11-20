import { expect, test } from 'bun:test';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startE2ENixie({
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

test('it fires a slot once when nixie dies before the batch commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([{ point: 'trigger.batch.before', kind: 'trigger' }]);

  await first.ready;

  await ctx.nixie.advanceUntilArrival(first, 'trigger.batch.before', {
    stepMs: 300_000,
    maxSteps: 2,
  });

  const beforeKill = await ctx.nixie.readRecords();

  await first.kill();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The tomatoes are watered.' } },
    },
    { text: 'Done.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.kind === 'task_message');
  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(beforeKill.filter((record) => record.kind === 'trigger.fired')).toStrictEqual([]);

  expect(
    records
      .filter((record) => record.kind === 'trigger.fired')
      .map((record) => record.payload['scheduledFor']),
  ).toStrictEqual(['1970-01-01T00:20:00.000Z']);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    strayReplies: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});

test('it fires a slot once when nixie dies after the batch commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([{ point: 'trigger.batch.after', kind: 'trigger' }]);

  await first.ready;

  await ctx.nixie.advanceUntilArrival(first, 'trigger.batch.after', {
    stepMs: 300_000,
    maxSteps: 2,
  });

  await first.kill();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The tomatoes are watered.' } },
    },
    { text: 'Done.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.kind === 'task_message');
  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(
    records
      .filter((record) => record.kind === 'trigger.fired')
      .map((record) => record.payload['scheduledFor']),
  ).toStrictEqual(['1970-01-01T00:20:00.000Z']);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    strayReplies: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});

test('it opens the task run once after a restart when nixie dies between the fire and the claim', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();
  await first.request('arm', { point: 'claim.before', kind: 'task', times: 1000 });
  await ctx.nixie.advanceUntilRecord(300_000, 2, (record) => record.kind === 'trigger.fired');

  const beforeKill = await ctx.nixie.readRecords();

  await first.kill();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The tomatoes are watered.' } },
    },
    { text: 'Done.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord(
    (record) =>
      record.kind === 'task.run_opened' && record.payload['definitionID'] === 'water-the-tomatoes',
  );

  await ctx.nixie.waitForRecord((record) => record.kind === 'task_message');
  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(beforeKill.filter((record) => record.kind === 'task.run_opened')).toStrictEqual([]);

  expect(
    records
      .filter((record) => record.kind === 'task.run_opened')
      .map((record) => [record.payload['definitionID'], record.payload['origin']]),
  ).toStrictEqual([['water-the-tomatoes', { kind: 'trigger', sequence: expect.any(Number) }]]);

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    strayReplies: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});
