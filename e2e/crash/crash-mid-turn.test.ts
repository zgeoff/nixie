import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

// A test of a crash mid-turn: the conversation has one committed turn, then the scripted model
// calls test.send, which the test rule allows, and nixie dies at a fault point of that turn. The
// restart reruns the step with the same script.
async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it sends once when nixie dies after the action queued, before any attempt', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([
    { point: 'queue.commit.after' },

    // holds the action runner's claim, so no attempt starts before the kill
    { point: 'claim.after', kind: 'action' },
  ]);

  await first.ready;

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');

  ctx.nixie.model.addReplies({
    toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } },
  });

  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await first.waitForArrival('queue.commit.after');
  await first.kill();

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Sent.' },
  );

  ctx.nixie.provider.addReplies({ kind: 'success', result: { delivered: true } });

  const second = ctx.nixie.harness.start();

  await second.ready;

  const outcome = await ctx.nixie.waitForRecord((record) => record.kind === 'action.outcome');

  // ends the turn's wait for the outcome, which polls on the one clock
  await ctx.nixie.advanceUntilRecord(10_000, 3, (record) => record.stepKey === 'conversation:2');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const queued = records.filter((record) => record.kind === 'action.queued');
  const actionID = String(queued[0]?.payload['actionID']);

  const rerunRequest = ctx.nixie.model.requests
    .slice(rerunFrom)
    .find((request) => request.path === '/v1/messages');

  invariant(rerunRequest?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(queued).toHaveLength(1);
  expect(outcome.payload).toStrictEqual({ actionID, status: 'done', attempt: 1, reason: null });

  expect(
    records
      .filter((record) => record.kind === 'tool_result')
      .map((record) => record.payload['actionID']),
  ).toStrictEqual([actionID]);

  expect(ctx.nixie.provider.calls).toStrictEqual([
    { idempotencyKey: actionID, body: { to: 'team', body: 'The summary.' } },
  ]);

  expect(JSON.stringify(rerunRequest.body.messages)).toInclude('Hi.');
  expect(JSON.stringify(rerunRequest.body.messages)).not.toInclude('tool_use');

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);

test('it leaves the action unknown and calls no provider when nixie dies after the attempt record', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([{ point: 'attempt.record.after' }]);

  await first.ready;

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');

  ctx.nixie.model.addReplies({
    toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } },
  });

  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await first.waitForArrival('attempt.record.after');
  await first.kill();

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'I could not tell whether it was sent.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const queued = records.filter((record) => record.kind === 'action.queued');
  const actionID = String(queued[0]?.payload['actionID']);

  const rerunRequest = ctx.nixie.model.requests
    .slice(rerunFrom)
    .find((request) => request.path === '/v1/messages');

  invariant(rerunRequest?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(queued).toHaveLength(1);

  expect(
    records.filter((record) => record.kind === 'action.outcome').map((record) => record.payload),
  ).toStrictEqual([{ actionID, status: 'unknown', attempt: 1, reason: 'attempt_without_result' }]);

  expect(
    records
      .filter((record) => record.kind === 'tool_result')
      .map((record) => [record.payload['outcome'], record.payload['actionID']]),
  ).toStrictEqual([['unknown', actionID]]);

  expect(ctx.nixie.provider.calls).toStrictEqual([]);
  expect(JSON.stringify(rerunRequest.body.messages)).toInclude('Hi.');
  expect(JSON.stringify(rerunRequest.body.messages)).not.toInclude('tool_use');

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);

test('it leaves the action unknown and calls the provider once when nixie dies before the result commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([{ point: 'attempt.result.before' }]);

  await first.ready;

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');

  ctx.nixie.model.addReplies({
    toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } },
  });

  ctx.nixie.provider.addReplies({ kind: 'success', result: { delivered: true } });
  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await first.waitForArrival('attempt.result.before');
  await first.kill();

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'I could not tell whether it was sent.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const queued = records.filter((record) => record.kind === 'action.queued');
  const actionID = String(queued[0]?.payload['actionID']);

  const rerunRequest = ctx.nixie.model.requests
    .slice(rerunFrom)
    .find((request) => request.path === '/v1/messages');

  invariant(rerunRequest?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(queued).toHaveLength(1);

  expect(
    records.filter((record) => record.kind === 'action.outcome').map((record) => record.payload),
  ).toStrictEqual([{ actionID, status: 'unknown', attempt: 1, reason: 'attempt_without_result' }]);

  expect(
    records
      .filter((record) => record.kind === 'tool_result')
      .map((record) => [record.payload['outcome'], record.payload['actionID']]),
  ).toStrictEqual([['unknown', actionID]]);

  expect(ctx.nixie.provider.calls).toStrictEqual([
    { idempotencyKey: actionID, body: { to: 'team', body: 'The summary.' } },
  ]);

  expect(JSON.stringify(rerunRequest.body.messages)).toInclude('Hi.');
  expect(JSON.stringify(rerunRequest.body.messages)).not.toInclude('tool_use');

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);

test('it returns the done action to the rerun and sends once when nixie dies before the step commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([
    { point: 'step.commit.before', workID: 'conversation', times: 2 },
  ]);

  await first.ready;

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  const arrival = await first.waitForArrival('step.commit.before');

  first.release(arrival);

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Sent.' },
  );

  ctx.nixie.provider.addReplies({ kind: 'success', result: { delivered: true } });
  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await ctx.nixie.waitForRecord((record) => record.kind === 'action.outcome');

  // ends the turn's wait for the outcome, which polls on the one clock
  await ctx.nixie.advanceUntilArrival(first, 'step.commit.before', { stepMs: 10_000, maxSteps: 3 });
  await first.kill();

  const rerunFrom = ctx.nixie.model.requests.length;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Sent.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const queued = records.filter((record) => record.kind === 'action.queued');
  const actionID = String(queued[0]?.payload['actionID']);

  const rerunRequest = ctx.nixie.model.requests
    .slice(rerunFrom)
    .find((request) => request.path === '/v1/messages');

  invariant(rerunRequest?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(queued).toHaveLength(1);

  expect(
    records
      .filter((record) => record.kind === 'tool_result')
      .map((record) => [record.payload['outcome'], record.payload['actionID']]),
  ).toStrictEqual([
    ['result', actionID],
    ['result', actionID],
  ]);

  expect(ctx.nixie.provider.calls).toStrictEqual([
    { idempotencyKey: actionID, body: { to: 'team', body: 'The summary.' } },
  ]);

  expect(JSON.stringify(rerunRequest.body.messages)).toInclude('Hi.');
  expect(JSON.stringify(rerunRequest.body.messages)).not.toInclude('tool_use');

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);
