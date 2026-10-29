import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { claimTestAction } from './test-utils/claim-test-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

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
