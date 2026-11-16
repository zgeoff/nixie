import { expect, test } from 'bun:test';
import { runProjectionRebuild, withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { buildStubConnector } from '../test-utils/build-stub-connector';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { startTestActions } from '../test-utils/start-test-actions';
import type { ActionsTables } from '../types';
import { createAllowedAction } from './create-allowed-action';
import { createApprovedAction } from './create-approved-action';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it rebuilds an action that a refusal returned to pending equal to the live one', async () => {
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

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [
        'test.send',
        buildStubConnector(() => ({ kind: 'refused_retryable', reason: 'rate limited' })).connector,
      ],
    ]),
    leaseMs: 60_000,
  });

  const live = await ctx.db.selectFrom('actions').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(live).toMatchObject([{ status: 'pending' }]);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds an action that a stop cancelled equal to the live one', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const live = await ctx.db.selectFrom('actions').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(live).toMatchObject([{ status: 'pending', cancelled_sequence: expect.toBeNumber() }]);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds an action that settled as done equal to the live one', async () => {
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

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [
        'test.send',
        buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } })).connector,
      ],
    ]),
    leaseMs: 60_000,
  });

  const live = await ctx.db.selectFrom('actions').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(live).toMatchObject([{ status: 'done' }]);
  expect(rebuilt).toStrictEqual(live);
});

test.each([
  ['an action that waits for its check', { kind: 'check', tool: 'test.send' } as const],
  [
    'an action that retries under its key',
    { kind: 'idempotency_key', where: 'header', keptForMs: 3_600_000 } as const,
  ],
  ['an action that came to the owner', { kind: 'none' } as const],
])('it rebuilds %s equal to the live one', async (_name, reconcile) => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    callSequence: 1,
    deadlineAt: 2_000_000,
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const stub = buildStubConnector(() => ({ kind: 'ambiguous', reason: 'timed out' }));

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', { ...stub.connector, reconcile }]]),
    leaseMs: 60_000,
  });

  const live = await ctx.db.selectFrom('actions').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(live).toMatchObject([{ unknown_streak: expect.any(Number), deadline_at: 2_000_000 }]);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds an approved action that a proposal held equal to the live one', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await withWriteTransaction(ctx.writer, (tx) =>
    createApprovedAction(tx, ctx.context, {
      proposalID: 'proposal-1',
      taskID: step.lease.workID,
      stepKey: null,
      tool: 'test.send',
      effects: ['send'],
      actionHash: 'sha256:approved',
      arguments: { to: 'team' },
      callSequence: 1,
      riskClass: 'always_ask',
      deadlineAt: null,
    }),
  );

  const live = await ctx.db.selectFrom('actions').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('actions').selectAll().execute();

  expect(live).toMatchObject([{ is_approved: 1, risk_class: 'always_ask' }]);
  expect(rebuilt).toStrictEqual(live);
});
