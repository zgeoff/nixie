import { expect, test } from 'bun:test';
import { runOracle, startSpawnedNixie } from '@heynixie/server/test-utils';

async function setupTest() {
  const nixie = await startSpawnedNixie();

  return { nixie };
}

test('it settles a checked send from the provider when nixie dies before the result commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();
  await first.request('arm', { point: 'attempt.result.before' });

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await ctx.nixie.markKnownContact('team');

  ctx.nixie.model.addReplies({
    toolUse: {
      name: 'mcp__nixie__test_send_checked',
      input: { to: 'team', body: 'The summary.' },
    },
  });

  ctx.nixie.provider.addReplies({ kind: 'success', result: { delivered: true } });
  ctx.nixie.provider.addCheckReplies({ kind: 'found', result: { delivered: true } });
  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await first.waitForArrival('attempt.result.before');
  await first.kill();

  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__test_send_checked',
        input: { to: 'team', body: 'The summary.' },
      },
    },
    { text: 'It was sent.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.harness.advance(61_000);

  const outcome = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'action.outcome' && record.thread === 'conversation',
  );

  await second.kill();

  const allRecords = await ctx.nixie.readRecords();

  const records = allRecords.filter((record) => record.thread !== 'queue-check');

  const actionID = String(
    records.find((record) => record.kind === 'action.queued')?.payload['actionID'],
  );

  const oracle = await runOracle(ctx.nixie);

  expect(outcome.payload).toStrictEqual({
    actionID,
    tool: 'test.send_checked',
    status: 'done',
    attempt: 1,
    reason: null,
  });

  expect(
    records
      .filter((record) => record.kind === 'action.reconcile_checked')
      .map((record) => record.payload['answer']),
  ).toStrictEqual(['found']);

  expect(ctx.nixie.provider.calls).toHaveLength(1);
  expect(ctx.nixie.provider.checkCalls).toHaveLength(1);

  expect(
    records
      .filter((record) => record.kind === 'action.outcome')
      .map((record) => record.payload['status']),
  ).toStrictEqual(['done']);

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

test('it retries a keyed send under the same key when nixie dies before the result commits', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();
  await first.request('arm', { point: 'attempt.result.before' });

  ctx.nixie.model.addReplies({ text: 'Hi.' });
  void first.request('sendMessage', { thread: 'conversation', text: 'Hello.' });

  await ctx.nixie.waitForRecord((record) => record.stepKey === 'conversation:1');
  await ctx.nixie.markKnownContact('team');

  ctx.nixie.model.addReplies({
    toolUse: { name: 'mcp__nixie__test_send_keyed', input: { to: 'team', body: 'The summary.' } },
  });

  ctx.nixie.provider.addReplies(
    { kind: 'success', result: { delivered: true } },
    { kind: 'success', result: { delivered: true } },
  );

  void first.request('sendMessage', { thread: 'conversation', text: 'Send the summary.' });

  await first.waitForArrival('attempt.result.before');
  await first.kill();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__test_send_keyed', input: { to: 'team', body: 'The summary.' } },
    },
    { text: 'It was sent.' },
  );

  const second = ctx.nixie.harness.start();

  await second.ready;

  const outcome = await ctx.nixie.advanceUntilRecord(
    10_000,
    20,
    (record) => record.kind === 'action.outcome' && record.thread === 'conversation',
  );

  await second.kill();

  const allRecords = await ctx.nixie.readRecords();

  const records = allRecords.filter((record) => record.thread !== 'queue-check');

  const actionID = String(
    records.find((record) => record.kind === 'action.queued')?.payload['actionID'],
  );

  expect(outcome.payload).toStrictEqual({
    actionID,
    tool: 'test.send_keyed',
    status: 'done',
    attempt: 2,
    reason: null,
  });

  expect(ctx.nixie.provider.calls.map((call) => call.idempotencyKey)).toStrictEqual([
    actionID,
    actionID,
  ]);
});
