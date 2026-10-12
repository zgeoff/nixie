import { expect, test } from 'bun:test';
import { createAllowedAction } from '../create-allowed-action';
import { claimTestAction } from './claim-test-action';
import { createTestStep } from './create-test-step';
import { startTestActions } from './start-test-actions';

function setupTest() {
  return startTestActions();
}

test('it claims the due action for the holder under the lease length', async () => {
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

  expect(lease).toStrictEqual({
    kind: 'action',
    workID: queued.actionID,
    holder: 'runner-a',
    generation: 1,
    epoch: ctx.writer.epoch,
    expiresAt: 1_060_000,
  });
});
