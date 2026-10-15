import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { setFaultPointHandler } from '@heynixie/tasks';
import { createAllowedAction, runActionAttempt } from './index';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { claimTestAction } from './test-utils/claim-test-action';
import { createTestStep } from './test-utils/create-test-step';
import { runStalledAttempt } from './test-utils/run-stalled-attempt';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it calls the provider with the action ID as the idempotency key', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  expect(stub.calls).toStrictEqual([
    {
      actionID: queued.actionID,
      tool: 'test.send',
      arguments: { to: 'team' },
      attempt: 1,
      idempotencyKey: queued.actionID,
    },
  ]);
});

test('it settles a success as done', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(action).toMatchObject({ status: 'done', attempt_count: 1, attempt_open: 0 });
});

test('it puts the result of a success in the task inbox', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(
    entries.map((entry) => entry.record).filter((record) => record.kind === 'action.outcome'),
  ).toMatchObject([
    {
      thread: step.lease.workID,
      payload: { actionID: queued.actionID, status: 'done', attempt: 1, reason: null },
      erasable: { status: 'readable', fields: { result: { messageID: 'm-1' } } },
    },
  ]);
});

test('it settles a refusal with no effect as failed, with the reason in the inbox', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'refused', reason: 'no such recipient' }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(
    entries.map((entry) => entry.record).filter((record) => record.kind === 'action.outcome'),
  ).toMatchObject([
    {
      payload: { status: 'failed', reason: 'refused' },
      erasable: { fields: { message: 'no such recipient' } },
    },
  ]);
});

test('it returns a refusal that can clear to pending, with its next attempt time', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'refused_retryable', reason: 'rate limited' }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  const outcomes = await ctx.db
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'action.outcome')
    .execute();

  expect(action).toMatchObject({
    status: 'pending',
    attempt_count: 1,
    attempt_open: 0,
    next_attempt_at: 1_030_000,
    reason: 'refusal_can_clear',
  });

  expect(outcomes).toStrictEqual([]);
});

test('it settles an ambiguous response as unknown', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(action).toMatchObject({ status: 'unknown', reason: 'ambiguous' });
});

test('it settles a provider call that threw, such as a dropped connection, as unknown', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => {
    throw new Error('socket hang up');
  });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(
    entries.map((entry) => entry.record).filter((record) => record.kind === 'action.outcome'),
  ).toMatchObject([
    {
      payload: { status: 'unknown', reason: 'ambiguous' },
      erasable: { fields: { message: 'socket hang up' } },
    },
  ]);
});

test('it marks an action whose attempt record has no result unknown, and calls no provider', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await runStalledAttempt(ctx);

  const reclaim = await claimTestAction(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await runActionAttempt(ctx.context, reclaim, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(action).toMatchObject({ status: 'unknown', reason: 'attempt_without_result' });
  expect(stub.calls).toStrictEqual([]);
});

test('it commits no result once its lease is lost during the provider call', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => {
    // the runner stalled past its lease, and a second runner claimed the action
    ctx.clock.advance(60_000);

    return { kind: 'success', result: {} };
  });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(action).toMatchObject({ status: 'pending', attempt_count: 1, attempt_open: 1 });
});

test('it fails an action whose tool has no connector', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, { connectors: new Map(), leaseMs: 60_000 });

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(action).toMatchObject({ status: 'failed', reason: 'unknown_tool', attempt_count: 0 });
});

test('it reaches each attempt fault point in order', async () => {
  const ctx = await setupTest();

  const reached: string[] = [];

  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  setFaultPointHandler((id) => {
    reached.push(id);
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      ['test.send', buildStubConnector(() => ({ kind: 'success', result: {} })).connector],
    ]),
    leaseMs: 60_000,
  });

  expect(reached).toStrictEqual([
    'attempt.record.after',
    'attempt.result.before',
    'attempt.result.after',
    'inbox.write.after',
  ]);
});
