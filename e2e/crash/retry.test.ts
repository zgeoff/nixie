import { expect, test } from 'bun:test';
import { runOracle } from '../test-utils/run-oracle';
import { startSpawnedNixie } from '../test-utils/start-spawned-nixie';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie };
}

test('it resumes the retry schedule across a restart and fails the action on the fifth refusal', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();
  await first.request('arm', { point: 'attempt.result.after', kind: 'action' });

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

  const allActionsAfterKill = await ctx.nixie.readRows('actions');

  const actionsAfterKill = allActionsAfterKill.filter(
    (action) => action['task_id'] === 'conversation',
  );

  ctx.nixie.model.addReplies({ text: 'The send failed.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  const callsBeforeDue: number[] = [];
  const attemptTimes: number[] = [1_000_000];

  for (const attempt of [2, 3, 4, 5]) {
    const rows = await ctx.nixie.readRows('actions');

    const dueAt = Number(
      rows.find((row) => row['task_id'] === 'conversation')?.['next_attempt_at'],
    );

    await ctx.nixie.harness.advance(dueAt - 1 - ctx.nixie.harness.now(), { settle: true });

    callsBeforeDue.push(ctx.nixie.provider.calls.length);

    await ctx.nixie.harness.advance(1000);

    attemptTimes.push(ctx.nixie.harness.now());

    await ctx.nixie.waitForRecord(
      (record) =>
        ['action.retry_scheduled', 'action.outcome'].includes(record.kind) &&
        record.thread === 'conversation' &&
        record.payload['attempt'] === attempt,
    );
  }

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const allRecords = await ctx.nixie.readRecords();

  const records = allRecords.filter((record) => record.thread !== 'queue-check');
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
});

test('it marks a retry unknown when nixie dies after its attempt record, and never sends it again', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__test_send', input: { to: 'team', body: 'The summary.' } } },
    { text: 'Queued.' },
  );

  ctx.nixie.provider.addReplies({ kind: 'refused_retryable', reason: 'rate limited' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await ctx.nixie.waitForRecord((record) => record.kind === 'action.retry_scheduled');
  await ctx.nixie.advanceUntilRecord(10_000, 2, (record) => record.stepKey === 'conversation:1');
  await first.request('arm', { point: 'attempt.record.after', kind: 'action' });
  await ctx.nixie.harness.advance(30_000);
  await first.waitForArrival('attempt.record.after');
  await first.kill();

  ctx.nixie.model.addReplies({ text: 'I could not tell whether it was sent.' });

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:2');
  await second.kill();

  const allRecords = await ctx.nixie.readRecords();

  const records = allRecords.filter((record) => record.thread !== 'queue-check');
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
});
