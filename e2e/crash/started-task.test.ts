import { expect, test } from 'bun:test';
import { runOracle, startSpawnedNixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startSpawnedNixie();

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
