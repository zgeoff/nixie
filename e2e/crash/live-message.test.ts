import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { runOracle } from '../test-utils/run-oracle';
import { startSpawnedNixie } from '../test-utils/start-spawned-nixie';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie };
}

test('it leaves a live message unread when nixie dies before the step commits, and the rerun delivers it once', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();
  await first.request('arm', { point: 'step.commit.before', workID: 'conversation' });

  const toolCall = Promise.withResolvers<void>();

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} }, gate: toolCall.promise },
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is noon on the ninth.' },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'What time is it?' });

  await ctx.nixie.waitForModelCalls(1);

  const liveSequence = await first.request('sendMessage', {
    thread: 'conversation',
    text: 'And the date, please.',
  });

  invariant(typeof liveSequence === 'number');

  toolCall.resolve();

  await first.waitForArrival('step.commit.before');
  await first.kill();

  const readBeforeCrash = ctx.nixie.model.requests
    .filter((request) => request.path === '/v1/messages')
    .some((request) => JSON.stringify(request.body?.messages).includes('And the date, please.'));

  const recordsBeforeRestart = await ctx.nixie.readRecords();

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies({ text: 'It is noon.' }, { text: 'It is the ninth.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  const committed = await ctx.nixie.advanceUntilRecord(
    10_000,
    3,
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:1',
  );

  await second.kill();

  const rerunRequests = ctx.nixie.model.requests
    .slice(rerunFrom)
    .filter((request) => request.path === '/v1/messages');

  const rerunRequest = rerunRequests.at(-1);

  invariant(rerunRequest?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(readBeforeCrash).toBe(true);

  expect(
    recordsBeforeRestart.filter(
      (record) => record.kind === 'task.step_committed' && record.thread === 'conversation',
    ),
  ).toStrictEqual([]);

  expect(rerunRequests).toHaveLength(2);
  expect(JSON.stringify(rerunRequest.body.messages).split('And the date, please.')).toHaveLength(2);
  expect(committed.payload['readCursor']).toBeGreaterThanOrEqual(liveSequence);

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
