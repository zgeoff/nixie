import { expect, test } from 'bun:test';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startE2ENixie();

  return { nixie };
}

test("it keeps a waiting started task's imp through a crash, and resumes the same session at its next step", async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

  // The conversation's reply after its start and the task's first turn ask the model at about
  // the same time, so both get the same text.
  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__task_start',
        input: { name: 'Tide tables', brief: 'Find the high tides at Bramble Quay on Saturday.' },
      },
    },
    { text: 'Noted.' },
    { text: 'Noted.' },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'When is high tide?' });

  const created = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.created' && record.payload['startedBy'] === 'conversation',
  );

  const taskID = String(created.payload['taskID']);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.kill();

  ctx.nixie.model.addReplies({ text: 'The morning tide is at 06:42.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  void second.request('sendMessage', { thread: taskID, text: 'Only the morning tide.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:2`);
  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  const taskSandboxes = records
    .filter((record) => record.kind === 'sandbox.created')
    .filter((record) => JSON.stringify(record.payload).includes(`"owner":"${taskID}"`))
    .map((record) => record.payload['sandboxID']);

  const destroyed = records
    .filter((record) => record.kind === 'sandbox.destroyed')
    .map((record) => record.payload['sandboxID']);

  const sessions = records
    .filter((record) => record.thread === taskID)
    .filter((record) => record.kind === 'model.session_opened')
    .map((record) => record.payload['kind']);

  expect(taskSandboxes).toHaveLength(1);
  expect(destroyed).not.toContain(taskSandboxes[0]);
  expect(sessions).toStrictEqual(['first']);

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

test('it ends a started task run in one report when its step crashes after an action ran and reruns', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();
  await ctx.nixie.markKnownContact('team');

  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__task_start',
        input: {
          name: 'Weekly summary',
          brief: 'Send the weekly summary to the team.',
          tools: ['test.send'],
        },
      },
    },
    { text: 'Noted.' },
    { text: 'Noted.' },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'Send the weekly summary.' });

  const created = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.created' && record.payload['startedBy'] === 'conversation',
  );

  const taskID = String(created.payload['taskID']);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await first.request('arm', { point: 'step.commit.before', workID: taskID });

  const taskReplies = [
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The summary is sent.' } } },
    { text: 'Done.' },
  ];

  ctx.nixie.model.addReplies(...taskReplies);
  ctx.nixie.provider.addReplies({ kind: 'success', result: { delivered: true } });
  void first.request('sendMessage', { thread: taskID, text: 'Send it now.' });

  await first.waitForArrival('step.commit.before', taskID);
  await first.kill();

  ctx.nixie.model.addReplies(...taskReplies);

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.run_ended' && record.thread === taskID,
  );

  await second.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  const ended = records.filter(
    (record) => record.kind === 'task.run_ended' && record.thread === taskID,
  );

  const reports = records.filter(
    (record) =>
      record.kind === 'task_message' &&
      record.payload['from'] === taskID &&
      record.payload['kind'] === 'report',
  );

  expect(ended.map((record) => record.payload['cause'])).toStrictEqual(['reported']);
  expect(reports).toHaveLength(1);
  expect(ctx.nixie.provider.calls).toHaveLength(1);

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
