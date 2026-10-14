import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { waitForCondition } from '../../libs/testing/src/index';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

// A test of lease expiry: runners A and B share one nixie process, whose task pool runs 3 runners,
// and the conversation's step is the work they contend for.
async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it lets runner B take an expired lease at the next generation, and commits the step once', async () => {
  const ctx = await setupTest();

  // only the first claim holds, so runner B passes the point
  const nixie = ctx.nixie.harness.start([{ point: 'claim.after', kind: 'task' }]);

  await nixie.ready;
  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void nixie.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  const runnerA = await nixie.waitForArrival('claim.after', 'conversation');

  // past the 60 s lease, so an idle runner wakes and claims the task
  await ctx.nixie.harness.advance(60_001);
  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await nixie.request('arm', { point: 'step.commit.before', workID: 'conversation' });
  nixie.release(runnerA);
  const arrival = await nixie.waitForArrival('step.commit.before', 'conversation');

  nixie.release(arrival);
  nixie.signal('SIGTERM');

  const exit = await nixie.exited;
  const records = await ctx.nixie.readRecords();

  const oracle = await runOracle(ctx.nixie);

  expect(exit).toStrictEqual({ code: 0, signal: null });
  expect(
    records
      .filter((record) => record.kind === 'task.step_started')
      .map((record) => record.payload['generation']),
  ).toStrictEqual([1, 2]);
  expect(
    records
      .filter((record) => record.kind === 'task.step_committed')
      .map((record) => record.stepKey),
  ).toStrictEqual(['conversation:1']);
  expect(records.filter((record) => record.kind === 'model.reply')).toHaveLength(1);
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

test('it lets runner B claim only once the renewed lease expires, never before', async () => {
  const ctx = await setupTest();
  const nixie = ctx.nixie.harness.start([{ point: 'renew.after', kind: 'task' }]);
  const lateReply = Promise.withResolvers<void>();

  await nixie.ready;

  // runner A's turn waits on the model, so its step outlives its lease
  ctx.nixie.model.addReplies({ text: 'Late.', gate: lateReply.promise }, { text: 'Hi.' });
  void nixie.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  // runner A's request takes the held reply before runner B's turn starts
  await waitForCondition(() =>
    ctx.nixie.model.requests.some((request) => request.path === '/v1/messages'),
  );
  await ctx.nixie.harness.advance(20_000);

  // the renewal at 1,020,000 moved the expiry to 1,080,000, and A's renewals stop here
  const renewal = await nixie.waitForArrival('renew.after', 'conversation');

  await ctx.nixie.harness.advance(59_999, { settle: true });

  const beforeExpiry = await ctx.nixie.readRecords();

  // one poll on, past the expiry, an idle runner wakes and claims
  await ctx.nixie.harness.advance(1000);
  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await nixie.request('arm', { point: 'step.commit.before', workID: 'conversation' });
  nixie.release(renewal);
  lateReply.resolve();
  const arrival = await nixie.waitForArrival('step.commit.before', 'conversation');

  nixie.release(arrival);
  nixie.signal('SIGTERM');

  const exit = await nixie.exited;
  const records = await ctx.nixie.readRecords();

  const oracle = await runOracle(ctx.nixie);

  expect(beforeExpiry.filter((record) => record.kind === 'task.step_started')).toHaveLength(1);
  expect(exit).toStrictEqual({ code: 0, signal: null });
  expect(
    records
      .filter((record) => record.kind === 'task.step_started')
      .map((record) => record.payload['generation']),
  ).toStrictEqual([1, 2]);
  expect(
    records
      .filter((record) => record.kind === 'task.step_committed')
      .map((record) => record.stepKey),
  ).toStrictEqual(['conversation:1']);
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

test("it refuses a call from runner A's guest once runner B holds the claim, and queues no action", async () => {
  const ctx = await setupTest();
  const nixie = ctx.nixie.harness.start([{ point: 'renew.after', kind: 'task' }]);
  const sendReply = Promise.withResolvers<void>();
  const takeoverReply = Promise.withResolvers<void>();

  await nixie.ready;

  // runner A's turn asks for test.send once its lease has expired, while runner B's turn still runs
  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } },
      gate: sendReply.promise,
    },
    { text: 'Hi.', gate: takeoverReply.promise },
    { text: 'Late.' },
  );
  void nixie.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });
  await waitForCondition(() =>
    ctx.nixie.model.requests.some((request) => request.path === '/v1/messages'),
  );
  await ctx.nixie.harness.advance(20_000);

  // A's renewals stop here, so A never learns that its lease expired
  const renewal = await nixie.waitForArrival('renew.after', 'conversation');

  await ctx.nixie.harness.advance(61_000);
  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_started' && record.payload['generation'] === 2,
  );
  await waitForCondition(
    () =>
      ctx.nixie.model.requests.filter((request) => request.path === '/v1/messages').length === 2,
  );
  sendReply.resolve();
  await ctx.nixie.waitForRecord((record) => record.kind === 'tool_result');
  await waitForCondition(
    () =>
      ctx.nixie.model.requests.filter((request) => request.path === '/v1/messages').length === 3,
  );
  nixie.release(renewal);
  takeoverReply.resolve();
  await ctx.nixie.waitForRecord((record) => record.kind === 'task.step_committed');
  nixie.signal('SIGTERM');

  const exit = await nixie.exited;
  const records = await ctx.nixie.readRecords();
  const actions = await ctx.nixie.readRows('actions');
  const followUp = ctx.nixie.model.requests
    .filter((request) => request.path === '/v1/messages')
    .at(2);
  invariant(followUp?.body);

  const oracle = await runOracle(ctx.nixie);

  expect(exit).toStrictEqual({ code: 0, signal: null });
  expect(
    records
      .filter((record) => record.kind === 'tool_result')
      .map((record) => record.payload['outcome']),
  ).toStrictEqual(['error']);
  expect(records.filter((record) => record.kind === 'action.queued')).toStrictEqual([]);
  expect(actions).toStrictEqual([]);
  expect(ctx.nixie.provider.calls).toStrictEqual([]);
  expect(JSON.stringify(followUp.body.messages)).toInclude(
    "the call comes from no step that holds conversation's claim, so it queues nothing",
  );
  expect(
    records
      .filter((record) => record.kind === 'task.step_committed')
      .map((record) => record.stepKey),
  ).toStrictEqual(['conversation:1']);
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

test('it expires the lease of a killed nixie on restart, runs the task once, and leaves a finished task done', async () => {
  const ctx = await setupTest();
  const first = ctx.nixie.harness.start([
    { point: 'claim.after', kind: 'task', workID: 'conversation' },
  ]);

  await first.ready;

  const created = await first.request('createTask', { brief: 'Finish at once.' });
  const finishedID = String(created);

  await ctx.nixie.waitForRecord((record) => record.stepKey === `${finishedID}:1`);
  await first.request('finishTask', { taskID: finishedID });
  await ctx.nixie.waitForRecord((record) => record.stepKey === `${finishedID}:2`);
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });
  await first.waitForArrival('claim.after', 'conversation');
  await first.kill();
  ctx.nixie.model.addReplies({ text: 'Hi.' });

  const second = ctx.nixie.harness.start();

  await second.ready;
  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await second.kill();

  const records = await ctx.nixie.readRecords();
  const tasks = await ctx.nixie.readRows('tasks');

  const oracle = await runOracle(ctx.nixie);

  expect(
    records
      .filter((record) => ['task.step_started', 'task.lease_expired'].includes(record.kind))
      .filter((record) => record.thread === 'conversation')
      .map((record) => [record.kind, record.payload['generation'] ?? null]),
  ).toStrictEqual([
    ['task.step_started', 1],
    ['task.lease_expired', null],
    ['task.step_started', 2],
  ]);
  expect(
    records
      .filter((record) => record.kind === 'task.step_committed')
      .map((record) => record.stepKey),
  ).toStrictEqual([`${finishedID}:1`, `${finishedID}:2`, 'conversation:1']);
  expect(tasks).toPartiallyContain({ task_id: finishedID, state: 'done' });
  expect(records.filter((record) => record.kind === 'model.reply')).toHaveLength(1);
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
