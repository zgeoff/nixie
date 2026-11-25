import { expect, onTestFinished, test } from 'bun:test';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  readRecordAttachments,
  readRecords,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import { buildActionProposalInput } from '@heynixie/policy';
import { setFaultPointHandler, writeStepCommit, writeTaskControl } from '@heynixie/tasks';
import { buildTaskSeeder, readTestLeases } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { claimAction, runActionAttempt } from '../index';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { buildTestActionsContext } from '../test-utils/build-test-actions-context';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { readTestAction } from '../test-utils/read-test-action';
import { runStalledAttempt } from '../test-utils/run-stalled-attempt';
import { startTestActions } from '../test-utils/start-test-actions';
import type { ActionsTables } from '../types';
import type { AttemptVerdict } from './attempt-check';

async function setupTest() {
  const actions = await startTestActions();

  const definitions = { snapshotHash: 'sha256:test' };

  return {
    ...actions,
    db: actions.writer.db.$extendTables<ActionsTables>(),
    seed: buildActionSeeder({ context: actions.context }),
    taskSeed: buildTaskSeeder({ context: actions.context }),
    definitions,
    pauseNixie: () =>
      withWriteTransaction(actions.writer, (tx) =>
        pauseNixieInTransaction(tx, actions.context.log, {
          cause: 'owner',
          recoveryID: null,
          by: 'session-a',
          definitions,
        }),
      ),
    resumeNixie: () =>
      withWriteTransaction(actions.writer, (tx) =>
        resumeNixieInTransaction(tx, actions.context.log, { by: 'session-a', definitions }),
      ),
    exemptTask: (taskID: string) =>
      withWriteTransaction(actions.writer, (tx) =>
        exemptTaskInTransaction(tx, actions.context.log, {
          taskID,
          by: 'session-a',
          definitions,
        }),
      ),
  };
}

test('it calls the provider with the action ID as the idempotency key', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
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
      snapshotHash: 'sha256:test',
      destinations: [],
      actionHash: expect.any(String),
      deadlineAt: null,
    },
  ]);
});

test('it calls the provider with the action ID and the count of refused attempts as the key after a refusal', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const stub = buildStubConnector((call) =>
    call.attempt === 1
      ? { kind: 'refused_retryable', reason: 'rate limited' }
      : { kind: 'success', result: { messageID: 'm-1' } },
  );

  const connectors = new Map([['test.send', stub.connector]]);

  const refusedLease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, refusedLease, { connectors, leaseMs: 60_000 });

  ctx.clock.advance(30_000);

  const retryLease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, retryLease, { connectors, leaseMs: 60_000 });

  expect(stub.calls.map((call) => call.idempotencyKey)).toStrictEqual([
    queued.actionID,
    `${queued.actionID}.1`,
  ]);
});

test('it counts a refused attempt and clears the first attempt time of the spent key', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [
        'test.send',
        buildStubConnector(() => ({ kind: 'refused_retryable', reason: 'rate limited' })).connector,
      ],
    ]),
    leaseMs: 60_000,
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  expect(action).toMatchObject({ refused_count: 1, first_attempt_at: null });
});

test.each([['stop'], ['pause'], ['close']] as const)(
  'it calls no provider and frees the lease when a %s lands after the claim',
  async (control) => {
    const ctx = await setupTest();
    const step = await createTestStep(ctx.context);

    const queued = await queueTestAction(ctx.context, {
      step,
      tool: 'test.send',
      actionHash: 'sha256:send-1',
      arguments: { to: 'team' },
      decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    });

    await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });

    const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

    await writeTaskControl(ctx.context, { taskID: step.lease.workID, control });

    const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));

    await runActionAttempt(ctx.context, lease, {
      connectors: new Map([['test.send', stub.connector]]),
      leaseMs: 60_000,
    });

    const action = await ctx.db
      .selectFrom('actions')
      .select(['attempt_count', 'outcome_sequence'])
      .where('action_id', '=', queued.actionID)
      .executeTakeFirstOrThrow();

    const leases = await readTestLeases(ctx.writer);

    const actionLease = leases.find((entry) => entry.workID === queued.actionID);

    expect(stub.calls).toStrictEqual([]);
    expect(action).toStrictEqual({ attempt_count: 0, outcome_sequence: null });
    expect(actionLease?.holder).toBeNull();
  },
);

test('it settles a success as done', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
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

  const queued = await queueTestAction(ctx.context, {
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

test('it seals the pictures of a success under the outcome record, with their media types', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const picture = new Uint8Array([137, 80, 78, 71]);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({
    kind: 'success',
    result: { messageID: 'm-1' },
    images: [{ mediaType: 'image/png', bytes: picture }],
  }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  const outcome = entries
    .map((entry) => entry.record)
    .find((record) => record.kind === 'action.outcome');

  invariant(outcome, 'the attempt wrote an outcome');

  const attachments = await readRecordAttachments(ctx.context.log, [outcome.sequence]);

  expect(outcome.erasable).toStrictEqual({
    status: 'readable',
    fields: { result: { messageID: 'm-1' }, imageTypes: ['image/png'] },
  });

  expect(attachments.get(outcome.sequence)).toStrictEqual({
    status: 'readable',
    attachments: [picture],
  });
});

test('it settles a refusal with no effect as failed, with the reason in the inbox', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
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

  await queueTestAction(ctx.context, {
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

  const outcomes = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

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

  await queueTestAction(ctx.context, {
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

  await queueTestAction(ctx.context, {
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

  await queueTestAction(ctx.context, {
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

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => {
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

  await queueTestAction(ctx.context, {
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

  await queueTestAction(ctx.context, {
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
    'attempt.admit.before',
    'attempt.record.after',
    'attempt.result.before',
    'attempt.result.after',
    'inbox.write.after',
  ]);
});

test('it starts no attempt for an action whose task nixie paused after the claim, and frees the lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });
  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await ctx.pauseNixie();

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const records = await readRecords(ctx.context.log, { afterSequence: 0 });
  const leases = await readTestLeases(ctx.writer);

  const action = await ctx.db
    .selectFrom('actions')
    .select(['status', 'attempt_count'])
    .where('action_id', '=', queued.action_id)
    .executeTakeFirstOrThrow();

  expect(stub.calls).toStrictEqual([]);
  expect(records.map((read) => read.record.kind)).not.toContain('action.attempt_started');

  expect(leases).toContainEqual({
    kind: 'action',
    workID: queued.action_id,
    holder: null,
    generation: 1,
  });

  expect(action).toStrictEqual({ status: 'pending', attempt_count: 0 });
});

test('it starts the attempt at the next claim after nixie resumes', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await ctx.seed.action({ step });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));
  const options = { connectors: new Map([['test.send', stub.connector]]), leaseMs: 60_000 };

  await ctx.pauseNixie();

  await runActionAttempt(ctx.context, lease, options);

  await ctx.resumeNixie();

  const next = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, next, options);

  expect(stub.calls).toHaveLength(1);
});

test('it fails an action past its deadline before it records an attempt or calls the provider', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    deadlineAt: 1_005_000,
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  ctx.clock.advance(5000);

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  expect(stub.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'failed', reason: 'deadline_passed', attempt_count: 0 });
});

test('it starts an action whose deadline has not come', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    deadlineAt: 1_005_000,
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  expect(action).toMatchObject({ status: 'done', deadline_at: 1_005_000 });
});

test('it fails an action whose deadline passes while its policy check runs, and calls no provider', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    deadlineAt: 1_005_000,
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: () => {
      ctx.clock.advance(5000);

      return Promise.resolve({ kind: 'go', destinations: [] });
    },
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  expect(stub.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'failed', reason: 'deadline_passed', attempt_count: 0 });
});

test('it fails an action that a rule now denies, and names the rule in the outcome', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    callSequence: 1,
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: () =>
      Promise.resolve({
        kind: 'deny',
        rule: { id: 'owner.no-team', revision: 2 },
        message: 'rule owner.no-team (r2)',
      }),
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, limit: 100 });

  const outcome = entries.find((entry) => entry.record.kind === 'action.outcome')?.record;

  const action = await readTestAction(ctx.writer, queued.actionID);

  expect(stub.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'failed', reason: 'rule_denied', attempt_count: 0 });

  expect(outcome?.payload).toStrictEqual({
    actionID: queued.actionID,
    tool: 'test.send',
    status: 'failed',
    attempt: 1,
    reason: 'rule_denied',
    rule: { id: 'owner.no-team', revision: 2 },
  });

  expect(outcome?.erasable).toStrictEqual({
    status: 'readable',
    fields: { message: 'rule owner.no-team (r2)' },
  });
});

test('it hands the checked destinations to the connector', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    callSequence: 1,
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: () => Promise.resolve({ kind: 'go', destinations: ['team'] }),
  });

  expect(stub.calls.map((call) => call.destinations)).toStrictEqual([['team']]);
});

test('it fails an action whose provider reports another destination set', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const stub = buildStubConnector(() => ({
    kind: 'destinations_changed',
    reason: 'the list grew',
  }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const action = await readTestAction(ctx.writer, queued.actionID);

  expect(action).toMatchObject({ status: 'failed', reason: 'destinations_changed' });
});

test('it holds an action that a rule allowed and now asks about, and runs none of it', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    callSequence: 1,
  });

  const proposal = buildActionProposalInput({
    definitions: ctx.definitions,
    thread: step.lease.workID,
    callSequence: 1,
    tool: 'test.send',
    effects: ['send'],
    cause: 'ask_rule',
    input: { to: 'team' },
    destinations: [{ value: 'team', replyTarget: false }],
    reopen: { proposalID: queued.actionID, actionID: queued.actionID },
  });

  const verdict: AttemptVerdict = {
    kind: 'ask',
    cause: 'ask_rule',
    destinations: ['team'],
    proposalID: queued.actionID,
    record: proposal.record,
  };

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: () => Promise.resolve(verdict),
  });

  const held = await readTestAction(ctx.writer, queued.actionID);
  const claimed = await claimAction(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(stub.calls).toStrictEqual([]);

  expect(held).toMatchObject({
    status: 'pending',
    held_by_proposal_id: queued.actionID,
    attempt_count: 0,
  });

  expect(claimed).toBeNull();
});

test('it starts no attempt and calls nothing when a hold begins after the policy check', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const hold: { prefixes: string[] } = { prefixes: [] };

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    readHeldToolPrefixes: () => hold.prefixes,
    checkAttempt: () => {
      hold.prefixes = ['test.'];

      return Promise.resolve({ kind: 'go', destinations: [] });
    },
  });

  const action = await readTestAction(ctx.writer, queued.actionID);
  const leases = await readTestLeases(ctx.writer);

  const actionLease = leases.find((entry) => entry.kind === 'action');

  expect([stub.calls, action.status, action.attempt_count, actionLease?.holder]).toStrictEqual([
    [],
    'pending',
    0,
    null,
  ]);
});

test('it keeps the admission of an attempt through its call, and ends it once the call settles', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const admissions: { open: number; openDuringCall: number | null } = {
    open: 0,
    openDuringCall: null,
  };

  const stub = buildStubConnector(() => {
    admissions.openDuringCall = admissions.open;

    return { kind: 'success', result: {} };
  });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    admitTool: () => {
      admissions.open += 1;

      return {
        run: (work) => work(),
        release: () => {
          admissions.open -= 1;
        },
      };
    },
  });

  expect(admissions).toStrictEqual({ open: 0, openDuringCall: 1 });
});

test('it starts no attempt and calls nothing when a hold begins between the last check and the commit', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const hold: { isHeld: boolean } = { isHeld: false };

  setFaultPointHandler((id) => {
    if (id === 'attempt.admit.before') {
      hold.isHeld = true;
    }
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    readHeldToolPrefixes: () => (hold.isHeld ? ['test.'] : []),
    admitTool: () => (hold.isHeld ? null : { run: (work) => work(), release: () => {} }),
    checkAttempt: () => Promise.resolve({ kind: 'go', destinations: [] }),
  });

  const action = await readTestAction(ctx.writer, queued.actionID);
  const leases = await readTestLeases(ctx.writer);

  const actionLease = leases.find((entry) => entry.kind === 'action');

  expect([stub.calls, action.status, action.attempt_count, actionLease?.holder]).toStrictEqual([
    [],
    'pending',
    0,
    null,
  ]);
});

test('it starts no attempt for an action whose task the spending stop holds after the claim, and frees the lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });
  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await buildLogSeeder(ctx.context).spendStop();

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const leases = await readTestLeases(ctx.writer);
  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(stub.calls).toStrictEqual([]);

  expect(leases).toContainEqual({
    kind: 'action',
    workID: queued.action_id,
    holder: null,
    generation: 1,
  });

  expect(action).toMatchObject({ status: 'pending', attempt_count: 0 });
});

test('it starts no attempt for an unstarted action whose task was paused after the claim, and frees the lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });
  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'pause' });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const leases = await readTestLeases(ctx.writer);

  expect(stub.calls).toStrictEqual([]);

  expect(leases).toContainEqual({
    kind: 'action',
    workID: queued.action_id,
    holder: null,
    generation: 1,
  });
});

test('it starts the next attempt of an action with a started attempt when its task is paused', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.pendingRetryScheduledAction({ step });

  await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'pause' });

  ctx.clock.advance(3_600_000);

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  expect(lease.workID).toBe(queued.action_id);
  expect(stub.calls).toHaveLength(1);
});

test('it starts no attempt for an unstarted action whose task reached its limit after the claim, and frees the lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });
  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await ctx.taskSeed.limitReached({ taskID: step.lease.workID, stepKey: step.stepKey });

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  const leases = await readTestLeases(ctx.writer);
  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(stub.calls).toStrictEqual([]);

  expect(leases).toContainEqual({
    kind: 'action',
    workID: queued.action_id,
    holder: null,
    generation: 1,
  });

  expect(action).toMatchObject({ status: 'pending', attempt_count: 0 });
});

test('it starts the next attempt of an action with a started attempt when its task reached its limit', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.pendingRetryScheduledAction({ step });

  await ctx.taskSeed.limitReached({ taskID: step.lease.workID, stepKey: step.stepKey });

  ctx.clock.advance(3_600_000);

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  expect(lease.workID).toBe(queued.action_id);
  expect(stub.calls).toHaveLength(1);
});

test('it settles nothing when a spending stop lands while the policy check runs, and frees the lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });
  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: async () => {
      await buildLogSeeder(ctx.context).spendStop();

      return {
        kind: 'deny',
        rule: { id: 'owner.no-team', revision: 2 },
        message: 'rule owner.no-team (r2)',
      };
    },
  });

  const leases = await readTestLeases(ctx.writer);
  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(stub.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'pending', attempt_count: 0 });

  expect(leases).toContainEqual({
    kind: 'action',
    workID: queued.action_id,
    holder: null,
    generation: 1,
  });
});

test('it settles nothing when a task limit lands while the policy check runs, and frees the lease', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });
  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'success', result: {} }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
    checkAttempt: async () => {
      await ctx.taskSeed.limitReached({ taskID: step.lease.workID, stepKey: step.stepKey });

      return {
        kind: 'deny',
        rule: { id: 'owner.no-team', revision: 2 },
        message: 'rule owner.no-team (r2)',
      };
    },
  });

  const leases = await readTestLeases(ctx.writer);
  const action = await readTestAction(ctx.writer, queued.action_id);

  expect(stub.calls).toStrictEqual([]);
  expect(action).toMatchObject({ status: 'pending', attempt_count: 0 });

  expect(leases).toContainEqual({
    kind: 'action',
    workID: queued.action_id,
    holder: null,
    generation: 1,
  });
});

test('it hands a retry the snapshot that its first attempt ran under, and not the one that queued the call', async () => {
  const ctx = await setupTest();

  const snapshot = { current: 'sha256:queued' };

  const context = buildTestActionsContext({
    log: ctx.context.log,
    clock: ctx.clock,
    definitions: () => ({ snapshotHash: snapshot.current }),
  });

  const step = await createTestStep(context);

  await queueTestAction(context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const stub = buildStubConnector(
    (call) =>
      call.attempt === 1
        ? { kind: 'ambiguous', reason: 'timed out' }
        : { kind: 'success', result: { messageID: 'm-1' } },
    { reconcile: { kind: 'idempotency_key', where: 'key', keptForMs: 86_400_000 } },
  );

  snapshot.current = 'sha256:first-attempt';

  const first = await claimTestAction(context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(context, first, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  snapshot.current = 'sha256:later';

  const second = await claimTestAction(context, { holder: 'runner-a', leaseMs: 60_000 });

  await runActionAttempt(context, second, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });

  expect(stub.calls.map((call) => [call.attempt, call.snapshotHash])).toStrictEqual([
    [1, 'sha256:queued'],
    [2, 'sha256:first-attempt'],
  ]);
});
