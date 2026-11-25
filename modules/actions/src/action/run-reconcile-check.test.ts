import { expect, test } from 'bun:test';
import type { ActionConnector } from '@heynixie/connectors';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { readTestAction } from '../test-utils/read-test-action';
import { startTestActions } from '../test-utils/start-test-actions';
import { claimAction } from './claim-action';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  const queued = await queueTestAction(actions.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const readKind = async (kind: string) => {
    const entries = await readRecords(actions.context.log, { afterSequence: 0, limit: 200 });

    return entries.map((entry) => entry.record).filter((record) => record.kind === kind);
  };

  return {
    ...actions,
    actionID: queued.actionID,
    readAction: () => readTestAction(actions.writer, queued.actionID),
    readOutcomes: async () => {
      const records = await readKind('action.outcome');

      return records.map((record) => record.payload);
    },
    readCheckAnswers: async () => {
      const records = await readKind('action.reconcile_checked');

      return records.map((record) => record.payload['answer']);
    },
    runNext: async (connector: ActionConnector) => {
      const lease = await claimTestAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

      await runActionAttempt(actions.context, lease, {
        connectors: new Map([['test.send', connector]]),
        leaseMs: 60_000,
      });
    },
    claimNext: () => claimAction(actions.context, { holder: 'runner-b', leaseMs: 60_000 }),
  };
}

test('it retries an unknown outcome under the same key while the provider keeps the key', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(
    (call) =>
      call.attempt === 1
        ? { kind: 'ambiguous', reason: 'timed out' }
        : { kind: 'success', result: { messageID: 'm-1' } },
    { reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 3_600_000 } },
  );

  await ctx.runNext(stub.connector);

  const afterUnknown = await ctx.readAction();
  const outcomesAfterUnknown = await ctx.readOutcomes();

  await ctx.runNext(stub.connector);

  const afterRetry = await ctx.readAction();

  expect(afterUnknown).toMatchObject({ status: 'pending', unknown_streak: 1, attempt_open: 0 });
  expect(outcomesAfterUnknown).toStrictEqual([]);
  expect(afterRetry).toMatchObject({ status: 'done', attempt_count: 2 });
  expect(stub.calls.map((call) => call.idempotencyKey)).toStrictEqual([ctx.actionID, ctx.actionID]);
});

test('it retries an unknown outcome after a refusal under the key of the refused attempt count', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(
    (call) => {
      if (call.attempt === 1) {
        return { kind: 'refused_retryable', reason: 'rate limited' };
      }

      return call.attempt === 2
        ? { kind: 'ambiguous', reason: 'timed out' }
        : { kind: 'success', result: { messageID: 'm-1' } };
    },
    { reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 3_600_000 } },
  );

  await ctx.runNext(stub.connector);

  ctx.clock.advance(30_000);

  await ctx.runNext(stub.connector);
  await ctx.runNext(stub.connector);

  expect(stub.calls.map((call) => call.idempotencyKey)).toStrictEqual([
    ctx.actionID,
    `${ctx.actionID}.1`,
    `${ctx.actionID}.1`,
  ]);
});

test('it brings an unknown outcome to the owner once the provider no longer keeps the key', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 0 },
  });

  await ctx.runNext(stub.connector);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      status: 'unknown',
      attempt: 1,
      reason: 'ambiguous',
      ownerReason: 'key_expired',
    },
  ]);
});

test('it sends nothing again when the provider dropped the key while the retry waited', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 3_600_000 },
  });

  await ctx.runNext(stub.connector);

  const waiting = await ctx.readAction();

  invariant(waiting.first_attempt_at !== null);

  // the log stamps the first attempt on the wall clock, so move the test clock to that time
  ctx.clock.advance(waiting.first_attempt_at - ctx.clock.now() + 3_600_000);

  await ctx.runNext(stub.connector);

  const outcomes = await ctx.readOutcomes();

  expect(stub.calls).toHaveLength(1);

  expect(outcomes).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      status: 'unknown',
      attempt: 1,
      reason: 'ambiguous',
      ownerReason: 'key_expired',
    },
  ]);
});

test('it settles an unknown outcome as done when the check finds the send, and sends nothing again', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'check', tool: 'test.send' },
    answerCheck: () => ({ kind: 'found', result: { messageID: 'm-9' } }),
  });

  await ctx.runNext(stub.connector);

  const waiting = await ctx.readAction();
  const claimedEarly = await ctx.claimNext();

  ctx.clock.advance(60_000);

  await ctx.runNext(stub.connector);

  const settled = await ctx.readAction();
  const answers = await ctx.readCheckAnswers();

  expect(waiting).toMatchObject({
    status: 'unknown',
    outcome_sequence: null,
    reconcile_at: 1_060_000,
  });

  expect(claimedEarly).toBeNull();
  expect(settled).toMatchObject({ status: 'done', reconcile_at: null });
  expect(answers).toStrictEqual(['found']);
  expect([stub.calls.length, stub.checks.length]).toStrictEqual([1, 1]);
});

test('it checks for an unknown outcome after a refusal under the key of the refused attempt count', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(
    (call) =>
      call.attempt === 1
        ? { kind: 'refused_retryable', reason: 'rate limited' }
        : { kind: 'ambiguous', reason: 'timed out' },
    {
      reconcile: { kind: 'check', tool: 'test.send' },
      answerCheck: () => ({ kind: 'found', result: { messageID: 'm-9' } }),
    },
  );

  await ctx.runNext(stub.connector);

  ctx.clock.advance(30_000);

  await ctx.runNext(stub.connector);

  ctx.clock.advance(60_000);

  await ctx.runNext(stub.connector);

  expect(stub.checks.map((check) => check.idempotencyKey)).toStrictEqual([`${ctx.actionID}.1`]);
});

test('it retries the send when the check does not find it', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(
    (call) =>
      call.attempt === 1
        ? { kind: 'ambiguous', reason: 'timed out' }
        : { kind: 'success', result: { messageID: 'm-1' } },
    { reconcile: { kind: 'check', tool: 'test.send' }, answerCheck: () => ({ kind: 'not_found' }) },
  );

  await ctx.runNext(stub.connector);

  ctx.clock.advance(60_000);

  await ctx.runNext(stub.connector);

  const afterCheck = await ctx.readAction();

  await ctx.runNext(stub.connector);

  const settled = await ctx.readAction();
  const answers = await ctx.readCheckAnswers();

  expect(afterCheck).toMatchObject({ status: 'pending', reconcile_at: null, attempt_count: 1 });
  expect(settled).toMatchObject({ status: 'done', attempt_count: 2 });
  expect(answers).toStrictEqual(['not_found']);
});

test('it brings an unknown outcome to the owner when the check is inconclusive', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'check', tool: 'test.send' },
    answerCheck: () => ({ kind: 'inconclusive' }),
  });

  await ctx.runNext(stub.connector);

  ctx.clock.advance(60_000);

  await ctx.runNext(stub.connector);

  const action = await ctx.readAction();
  const outcomes = await ctx.readOutcomes();

  expect(action).toMatchObject({ status: 'unknown' });

  expect(outcomes).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      status: 'unknown',
      attempt: 1,
      reason: 'ambiguous',
      ownerReason: 'inconclusive',
    },
  ]);
});

test('it brings an unknown outcome to the owner when the check finds nothing and the connector asks', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'check', tool: 'test.send', onNotFound: 'ask' },
    answerCheck: () => ({ kind: 'not_found' }),
  });

  await ctx.runNext(stub.connector);

  ctx.clock.advance(60_000);

  await ctx.runNext(stub.connector);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      status: 'unknown',
      attempt: 1,
      reason: 'ambiguous',
      ownerReason: 'not_found_ask',
    },
  ]);
});

test('it runs the check once the declared trust time has passed since the attempt started', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'check', tool: 'test.send', trustNegativeAfterMs: 5000 },
  });

  await ctx.runNext(stub.connector);

  const action = await ctx.readAction();

  expect(action.reconcile_at).toBe(1_005_000);
});

test('it brings the 3rd unknown outcome in a row to the owner whatever the connector declares', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }), {
    reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 3_600_000 },
  });

  await ctx.runNext(stub.connector);
  await ctx.runNext(stub.connector);

  const beforeThird = await ctx.readOutcomes();

  await ctx.runNext(stub.connector);

  const outcomes = await ctx.readOutcomes();

  expect(beforeThird).toStrictEqual([]);

  expect(outcomes).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      status: 'unknown',
      attempt: 3,
      reason: 'ambiguous',
      ownerReason: 'unknown_streak',
    },
  ]);
});

test('it brings an unknown outcome to the owner at once when the connector declares nothing', async () => {
  const ctx = await setupTest();

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }));

  await ctx.runNext(stub.connector);

  const outcomes = await ctx.readOutcomes();

  expect(outcomes).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      status: 'unknown',
      attempt: 1,
      reason: 'ambiguous',
      ownerReason: 'no_reconcile',
    },
  ]);
});
