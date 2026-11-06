import { expect, test } from 'bun:test';
import { createAllowedAction } from '../create-allowed-action';
import { createTestStep } from './create-test-step';
import { readTestActions } from './read-test-actions';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it reads each action with its step, its status and its attempts, in queue order', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const first = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const second = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.archive',
    actionHash: 'sha256:archive-1',
    arguments: { folder: 'invoices' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const actions = await readTestActions(ctx.context);

  expect(actions).toStrictEqual([
    {
      actionID: first.actionID,
      taskID: step.lease.workID,
      stepKey: step.stepKey,
      tool: 'test.send',
      status: 'pending',
      attemptCount: 0,
      isAttemptOpen: false,
      reason: null,
      outcomeSequence: null,
    },
    {
      actionID: second.actionID,
      taskID: step.lease.workID,
      stepKey: step.stepKey,
      tool: 'test.archive',
      status: 'pending',
      attemptCount: 0,
      isAttemptOpen: false,
      reason: null,
      outcomeSequence: null,
    },
  ]);
});

test('it reads no actions before any action is queued', async () => {
  const ctx = await setupTest();
  const actions = await readTestActions(ctx.context);

  expect(actions).toStrictEqual([]);
});
