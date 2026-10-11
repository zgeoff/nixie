import { expect, test } from 'bun:test';
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
    repeatedActionIDs: [],
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
    repeatedActionIDs: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);

test('it expires the lease of a killed nixie on restart, and runs the task once', async () => {
  const ctx = await setupTest();
  const first = ctx.nixie.harness.start([{ point: 'claim.after', kind: 'task' }]);

  await first.ready;
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });
  await first.waitForArrival('claim.after', 'conversation');
  await first.kill();
  ctx.nixie.model.addReplies({ text: 'Hi.' });

  const second = ctx.nixie.harness.start();

  await second.ready;
  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const oracle = await runOracle(ctx.nixie);

  expect(
    records
      .filter((record) => ['task.step_started', 'task.lease_expired'].includes(record.kind))
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
  ).toStrictEqual(['conversation:1']);
  expect(records.filter((record) => record.kind === 'model.reply')).toHaveLength(1);
  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActionIDs: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
}, 120_000);
