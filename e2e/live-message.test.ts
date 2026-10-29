import { expect, onTestFinished, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startSpawnedNixie } from './test-utils/start-spawned-nixie';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie };
}

test('it hands a message sent during a turn to the model at its next tool boundary, and the step commit marks it read', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

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

  const committed = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:1',
  );

  await first.kill();

  const toolResultRequests = ctx.nixie.model.requests
    .filter((request) => request.path === '/v1/messages')
    .map((request) => JSON.stringify(request.body?.messages))
    .filter((messages) => messages.includes('tool_result'));

  expect(toolResultRequests).toContainEqual(expect.toInclude('And the date, please.'));
  expect(committed.payload['nextState']).toBe('waiting');
  expect(committed.payload['readCursor']).toBeGreaterThanOrEqual(liveSequence);
});

test('it ends an interrupted turn, and the message the turn left unread starts the next turn', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

  const heldReply = Promise.withResolvers<void>();

  onTestFinished(() => heldReply.resolve());

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'It is noon.', gate: heldReply.promise },
    { text: 'It is the ninth.' },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'What time is it?' });

  await ctx.nixie.waitForModelCalls(2);

  const liveSequence = await first.request('sendMessage', {
    thread: 'conversation',
    text: 'Never mind, the date?',
  });

  invariant(typeof liveSequence === 'number');

  await first.request('controlTask', { taskID: 'conversation', control: 'interrupt' });

  const interruptedCommit = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:1',
  );

  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:2',
  );

  await first.kill();

  const records = await ctx.nixie.readRecords();

  const requests = ctx.nixie.model.requests.filter((request) => request.path === '/v1/messages');
  const [, heldRequest, nextTurnRequest] = requests;

  invariant(nextTurnRequest?.body);

  expect(
    records.filter((record) => record.kind === 'task.interrupted').map((record) => record.payload),
  ).toStrictEqual([{ taskID: 'conversation', stepKey: 'conversation:1' }]);

  expect(interruptedCommit.payload['nextState']).toBe('ready');
  expect(interruptedCommit.payload['readCursor']).toBeLessThan(liveSequence);
  expect(JSON.stringify(heldRequest?.body?.messages)).not.toInclude('Never mind, the date?');
  expect(JSON.stringify(nextTurnRequest.body.messages?.at(-1))).toInclude('Never mind, the date?');
});
