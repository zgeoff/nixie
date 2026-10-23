import { expect, test } from 'bun:test';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it wakes the conversation for a message written just before nixie died, and reads it once', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await first.request('arm', { point: 'inbox.write.after', workID: 'conversation' });

  void first.request('sendMessage', { thread: 'conversation', text: 'Are you there?' });

  await first.waitForArrival('inbox.write.after', 'conversation');
  await first.kill();

  ctx.nixie.model.addReplies({ text: 'Yes.' });

  const second = ctx.nixie.harness.start([{ point: 'recovery.step.5' }]);

  const recovered = await second.waitForArrival('recovery.step.5');
  const tasksAfterRecovery = await ctx.nixie.readRows('tasks');

  second.release(recovered);

  const committed = await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');

  await second.kill();

  const records = await ctx.nixie.readRecords();

  const messages = records.filter((record) => record.kind === 'owner_message');

  const lastRequest = ctx.nixie.model.requests.findLast(
    (request) => request.path === '/v1/messages',
  );

  const oracle = await runOracle(ctx.nixie);

  expect(tasksAfterRecovery).toMatchObject([{ task_id: 'conversation', state: 'ready' }]);
  expect(committed.payload['readCursor']).toBe(messages[1]?.sequence);
  expect(JSON.stringify(lastRequest?.body?.messages).split('Are you there?')).toHaveLength(2);

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

test('it wakes a task for a timer that fired just before nixie died, and reads it once', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  const created = await first.request('createTask', { brief: 'Wait an hour.' });

  const taskID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:1`);
  await first.request('arm', { point: 'inbox.write.after', workID: taskID });
  await ctx.nixie.harness.advance(3_600_000);
  await first.waitForArrival('inbox.write.after', taskID);
  await first.kill();

  const second = ctx.nixie.harness.start([{ point: 'recovery.step.5' }]);

  const recovered = await second.waitForArrival('recovery.step.5');
  const tasksAfterRecovery = await ctx.nixie.readRows('tasks');

  second.release(recovered);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:2`);
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const fired = records.filter((record) => record.kind === 'timer.fired');

  const oracle = await runOracle(ctx.nixie);

  expect(tasksAfterRecovery).toPartiallyContain({ task_id: taskID, state: 'ready' });
  expect(fired).toHaveLength(1);

  expect(
    records.filter((record) => record.kind === 'test.inbox_read').map((record) => record.payload),
  ).toStrictEqual([
    { taskID, sequences: [] },
    { taskID, sequences: [fired[0]?.sequence] },
  ]);

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

test('it wakes the conversation for an action outcome written just before nixie died, and reads it once', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();
  const delivery = Promise.withResolvers<void>();

  await first.ready;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Queued.' },
  );

  ctx.nixie.provider.addReplies({
    kind: 'success',
    result: { delivered: true },
    gate: delivery.promise,
  });

  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await ctx.nixie.waitForRecord((record) => record.kind === 'action.attempt_started');
  await ctx.nixie.advanceUntilRecord(10_000, 2, (record) => record.stepKey === 'conversation:1');
  await first.request('arm', { point: 'inbox.write.after', workID: 'conversation' });

  delivery.resolve();

  await first.waitForArrival('inbox.write.after', 'conversation');
  await first.kill();

  ctx.nixie.model.addReplies({ text: 'It was sent.' });

  const second = ctx.nixie.harness.start([{ point: 'recovery.step.5' }]);

  const recovered = await second.waitForArrival('recovery.step.5');
  const tasksAfterRecovery = await ctx.nixie.readRows('tasks');

  second.release(recovered);

  const committed = await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');

  await second.kill();

  const records = await ctx.nixie.readRecords();

  const outcome = records.find((record) => record.kind === 'action.outcome');

  const lastRequest = ctx.nixie.model.requests.findLast(
    (request) => request.path === '/v1/messages',
  );

  const oracle = await runOracle(ctx.nixie);

  expect(tasksAfterRecovery).toMatchObject([{ task_id: 'conversation', state: 'ready' }]);
  expect(outcome?.payload['status']).toBe('done');
  expect(committed.payload['readCursor']).toBe(outcome?.sequence);
  expect(JSON.stringify(lastRequest?.body?.messages).split('An action settled')).toHaveLength(2);

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

test('it reaches a task with input that arrives while its step runs, before the step registers its wait', async () => {
  const ctx = await setupTest();

  const nixie = ctx.nixie.harness.start([{ point: 'step.commit.before', kind: 'task' }]);

  await nixie.ready;

  const created = await nixie.request('createTask', { brief: 'Wait for a message.' });

  const taskID = String(created);

  const step = await nixie.waitForArrival('step.commit.before', taskID);
  const sequence = await nixie.request('sendMessage', { thread: taskID, text: 'One more thing.' });

  nixie.release(step);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${taskID}:2`);
  await nixie.kill();

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  expect(records.find((record) => record.stepKey === `${taskID}:1`)?.payload['nextState']).toBe(
    'ready',
  );

  expect(
    records.filter((record) => record.kind === 'test.inbox_read').map((record) => record.payload),
  ).toStrictEqual([
    { taskID, sequences: [] },
    { taskID, sequences: [sequence] },
  ]);

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
