import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { FaultPointID } from '@heynixie/tasks';
import { createTask, setFaultPointHandler } from '@heynixie/tasks';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

// a queued test.send action, claimed by a runner
async function setupTest() {
  const actions = await startTestActions();
  const db = actions.writer.db.$extendTables<ActionsTables>();
  const taskID = await createTask(actions.context, 'send the weekly summary');
  const queued = await createAllowedAction(actions.context, {
    taskID,
    stepKey: `${taskID}:1`,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });
  const lease = await claimAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (lease === null) {
    throw new Error('the setup claim found no action');
  }
  const readAction = () => db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();
  const readOutcomes = async () => {
    const entries = await readRecords(actions.context.log, { afterSequence: 0 });

    return entries
      .map((entry) => entry.record)
      .filter((record) => record.kind === 'action.outcome');
  };

  return { ...actions, db, taskID, actionID: queued.actionID, lease, readAction, readOutcomes };
}

test('it calls the provider with the action ID as the idempotency key', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  expect(stub.calls).toStrictEqual([
    {
      actionID: ctx.actionID,
      tool: 'test.send',
      arguments: { to: 'team' },
      attempt: 1,
      idempotencyKey: ctx.actionID,
    },
  ]);
});

test('it settles a success as done, with the result in the task inbox', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.readAction();
  const outcomes = await ctx.readOutcomes();

  expect(action).toMatchObject({ status: 'done', attempt_count: 1, attempt_open: 0 });
  expect(outcomes).toMatchObject([
    {
      thread: ctx.taskID,
      payload: { actionID: ctx.actionID, status: 'done', attempt: 1, reason: null },
      erasable: { status: 'readable', fields: { result: { messageID: 'm-1' } } },
    },
  ]);
});

test('it settles a refusal with no effect as failed, with the reason in the inbox', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => ({ kind: 'refused', reason: 'no such recipient' }));

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const outcomes = await ctx.readOutcomes();

  expect(outcomes).toMatchObject([
    {
      payload: { status: 'failed', reason: 'refused' },
      erasable: { fields: { message: 'no such recipient' } },
    },
  ]);
});

test('it returns a refusal that can clear to pending, with its next attempt time', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => ({ kind: 'refused_retryable', reason: 'rate limited' }));

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.readAction();
  const outcomes = await ctx.readOutcomes();

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
  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }));

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.readAction();

  expect(action).toMatchObject({ status: 'unknown', reason: 'ambiguous' });
});

test('it settles a provider call that threw, such as a dropped connection, as unknown', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => {
    throw new Error('socket hang up');
  });

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const outcomes = await ctx.readOutcomes();

  expect(outcomes).toMatchObject([
    {
      payload: { status: 'unknown', reason: 'ambiguous' },
      erasable: { fields: { message: 'socket hang up' } },
    },
  ]);
});

test('it marks an action whose attempt record has no result unknown, and calls no provider', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => {
    // the first runner stalled in the call past its lease, so its result never commits
    ctx.clock.advance(60_000);
    return { kind: 'success', result: {} };
  });

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const reclaim = await claimAction(ctx.context, { holder: 'runner-b', leaseMs: 60_000 }).then(
    (lease) => lease ?? Promise.reject(new Error('the second runner found no action to claim')),
  );

  await runActionAttempt(ctx.context, reclaim, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.readAction();

  expect(action).toMatchObject({ status: 'unknown', reason: 'attempt_without_result' });
  expect(stub.calls).toHaveLength(1);
});

test('it commits no result once its lease is lost during the provider call', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => {
    // the runner stalled past its lease, and a second runner claimed the action
    ctx.clock.advance(60_000);
    return { kind: 'success', result: {} };
  });

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await ctx.readAction();

  expect(action).toMatchObject({ status: 'pending', attempt_count: 1, attempt_open: 1 });
});

test('it fails an action whose tool has no connector', async () => {
  const ctx = await setupTest();

  await runActionAttempt(ctx.context, ctx.lease, { connectors: new Map(), leaseMs: 60_000 });

  const action = await ctx.readAction();

  expect(action).toMatchObject({ status: 'failed', reason: 'unknown_tool', attempt_count: 0 });
});

test('it reaches each attempt fault point in order', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));
  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await runActionAttempt(ctx.context, ctx.lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  expect(reached).toStrictEqual([
    'attempt.record.after',
    'attempt.result.before',
    'attempt.result.after',
    'inbox.write.after',
  ]);
});
