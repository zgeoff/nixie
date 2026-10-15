import { expect, test } from 'bun:test';
import { runOracle } from '../test-utils/run-oracle';
import { startTestNixie } from '../test-utils/start-test-nixie';

// A test of a retry: the conversation's model calls test.send, and the provider double refuses it
// with a refusal that can clear. The turn's own wait for the outcome runs out after 10 s on the
// clock, and the turn ends with the action pending.
async function setupTest() {
  const nixie = await startTestNixie();

  return { nixie };
}

test('it resumes the retry schedule across a restart and fails the action on the fifth refusal', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start([{ point: 'attempt.result.after', kind: 'action' }]);

  await first.ready;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Queued.' },
  );

  ctx.nixie.provider.addReplies(
    ...Array.from(
      { length: 5 },
      () => ({ kind: 'refused_retryable', reason: 'rate limited' }) as const,
    ),
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await first.waitForArrival('attempt.result.after');
  await ctx.nixie.advanceUntilRecord(10_000, 2, (record) => record.stepKey === 'conversation:1');
  await first.kill();

  const actionsAfterKill = await ctx.nixie.readRows('actions');

  ctx.nixie.model.addReplies({ text: 'The send failed.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  // for each later attempt: the clock stops 1 ms short of its due time, then runs one poll on
  const callsBeforeDue: number[] = [];
  const attemptTimes: number[] = [1_000_000];

  for (const attempt of [2, 3, 4, 5]) {
    // oxlint-disable-next-line no-await-in-loop -- each attempt follows the one before it
    const rows = await ctx.nixie.readRows('actions');

    const dueAt = Number(rows[0]?.['next_attempt_at']);

    // oxlint-disable-next-line no-await-in-loop -- as above
    await ctx.nixie.harness.advance(dueAt - 1 - ctx.nixie.harness.now(), { settle: true });

    callsBeforeDue.push(ctx.nixie.provider.calls.length);

    // oxlint-disable-next-line no-await-in-loop -- as above
    await ctx.nixie.harness.advance(1000);

    attemptTimes.push(ctx.nixie.harness.now());

    // oxlint-disable-next-line no-await-in-loop -- as above
    await ctx.nixie.waitForRecord(
      (record) =>
        ['action.retry_scheduled', 'action.outcome'].includes(record.kind) &&
        record.payload['attempt'] === attempt,
    );
  }

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const queued = records.find((record) => record.kind === 'action.queued');
  const actionID = String(queued?.payload['actionID']);
  const retries = records.filter((record) => record.kind === 'action.retry_scheduled');

  const lastRequest = ctx.nixie.model.requests.findLast(
    (request) => request.path === '/v1/messages',
  );

  const oracle = await runOracle(ctx.nixie);

  expect(actionsAfterKill).toMatchObject([
    { attempt_count: 1, attempt_open: 0, next_attempt_at: 1_030_000, status: 'pending' },
  ]);

  expect(callsBeforeDue).toStrictEqual([1, 2, 3, 4]);

  expect(
    records
      .filter((record) => record.kind === 'action.attempt_started')
      .map((record) => record.payload['attempt']),
  ).toStrictEqual([1, 2, 3, 4, 5]);

  expect(
    retries.map(
      (record, index) => Number(record.payload['nextAttemptAt']) - (attemptTimes[index] ?? 0),
    ),
  ).toStrictEqual([30_000, 120_000, 480_000, 1_800_000]);

  expect(
    records.filter((record) => record.kind === 'action.outcome').map((record) => record.payload),
  ).toStrictEqual([{ actionID, status: 'failed', attempt: 5, reason: 'retries_exhausted' }]);

  expect(ctx.nixie.provider.calls.map((call) => call.idempotencyKey)).toStrictEqual(
    Array.from({ length: 5 }, () => actionID),
  );

  expect(JSON.stringify(lastRequest?.body?.messages)).toInclude('retries_exhausted');

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

test('it marks a retry unknown when nixie dies after its attempt record, and never sends it again', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Queued.' },
  );

  ctx.nixie.provider.addReplies({ kind: 'refused_retryable', reason: 'rate limited' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await ctx.nixie.waitForRecord((record) => record.kind === 'action.retry_scheduled');
  await ctx.nixie.advanceUntilRecord(10_000, 2, (record) => record.stepKey === 'conversation:1');
  await first.request('arm', { point: 'attempt.record.after', kind: 'action' });

  // past the first retry's due time at 1,030,000
  await ctx.nixie.harness.advance(30_000);
  await first.waitForArrival('attempt.record.after');
  await first.kill();

  ctx.nixie.model.addReplies({ text: 'I could not tell whether it was sent.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const records = await ctx.nixie.readRecords();

  const queued = records.find((record) => record.kind === 'action.queued');
  const actionID = String(queued?.payload['actionID']);

  const oracle = await runOracle(ctx.nixie);

  expect(
    records
      .filter((record) => record.kind === 'action.attempt_started')
      .map((record) => record.payload['attempt']),
  ).toStrictEqual([1, 2]);

  expect(
    records.filter((record) => record.kind === 'action.outcome').map((record) => record.payload),
  ).toStrictEqual([{ actionID, status: 'unknown', attempt: 2, reason: 'attempt_without_result' }]);

  expect(ctx.nixie.provider.calls).toStrictEqual([
    { idempotencyKey: actionID, body: { to: 'team', body: 'The summary.' } },
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
}, 120_000);
