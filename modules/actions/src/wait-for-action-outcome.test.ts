import { expect, test } from 'bun:test';
import { createTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { startTestActions } from './test-utils/start-test-actions';
import { waitForActionOutcome } from './wait-for-action-outcome';

// a queued test.send action, not yet attempted
async function setupTest() {
  const actions = await startTestActions();
  const taskID = await createTask(actions.context, 'send the weekly summary');
  const queued = await createAllowedAction(actions.context, {
    taskID,
    stepKey: `${taskID}:1`,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  return { ...actions, actionID: queued.actionID };
}

test('it returns the outcome once the action settles within the wait', async () => {
  const ctx = await setupTest();
  const stub = buildStubConnector(() => ({ kind: 'success', result: { messageID: 'm-1' } }));
  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 }).then(
    (claimed) => claimed ?? Promise.reject(new Error('the setup claim found no action')),
  );
  const waiting = waitForActionOutcome(ctx.context, ctx.actionID);

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([['test.send', stub.connector]]),
    leaseMs: 60_000,
  });
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(250);

  const view = await waiting;

  expect(view).toStrictEqual({
    status: 'done',
    actionID: ctx.actionID,
    result: { messageID: 'm-1' },
  });
});

test('it returns "queued as" with the action ID once 10 s pass with the action pending', async () => {
  const ctx = await setupTest();

  const waiting = waitForActionOutcome(ctx.context, ctx.actionID);

  for (let polls = 0; polls < 40; polls += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each poll sleeps before time moves on
    await waitForCondition(() => ctx.clock.countSleepers() === 1);
    ctx.clock.advance(250);
  }

  const view = await waiting;

  expect(view).toStrictEqual({
    status: 'pending',
    actionID: ctx.actionID,
    message: `queued as \`${ctx.actionID}\``,
  });
});
