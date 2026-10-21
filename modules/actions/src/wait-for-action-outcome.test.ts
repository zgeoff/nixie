import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { claimTestAction } from './test-utils/claim-test-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import { waitForActionOutcome } from './wait-for-action-outcome';

async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  return { ...actions, step };
}

test('it returns the outcome on the commit that settles the action, without polling', async () => {
  const ctx = await setupTest();

  const queued = await createAllowedAction(ctx.context, {
    step: ctx.step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const waiting = waitForActionOutcome(ctx.context, queued.actionID);

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [
        'test.send',
        buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } })).connector,
      ],
    ]),
    leaseMs: 60_000,
  });

  const view = await waiting;

  expect(view).toStrictEqual({
    status: 'done',
    actionID: queued.actionID,
    result: { messageID: 'm-1' },
  });

  expect(ctx.clock.countSleepers()).toBe(0);
});

test('it returns "queued as" with the action ID once 10 s pass with the action pending', async () => {
  const ctx = await setupTest();

  const queued = await createAllowedAction(ctx.context, {
    step: ctx.step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const waiting = waitForActionOutcome(ctx.context, queued.actionID);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(10_000);

  const view = await waiting;

  expect(view).toStrictEqual({
    status: 'pending',
    actionID: queued.actionID,
    message: `queued as \`${queued.actionID}\``,
  });
});
