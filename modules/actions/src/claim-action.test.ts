import { expect, test } from 'bun:test';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

// one queued test.send action, due at once
async function setupTest() {
  const actions = await startTestActions();
  const db = actions.writer.db.$extendTables<ActionsTables>();
  const step = await createTestStep(actions.context);
  const queued = await createAllowedAction(actions.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  return { ...actions, db, actionID: queued.actionID };
}

test('it claims a due pending action with an action lease at generation 1', async () => {
  const ctx = await setupTest();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toStrictEqual({
    kind: 'action',
    workID: ctx.actionID,
    holder: 'runner-a',
    generation: 1,
    epoch: ctx.writer.epoch,
    expiresAt: 1_060_000,
  });
});

test('it leaves an action whose next attempt is not yet due', async () => {
  const ctx = await setupTest();

  await ctx.db.updateTable('actions').set({ next_attempt_at: 1_030_000 }).execute();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it leaves a settled action', async () => {
  const ctx = await setupTest();

  await ctx.db.updateTable('actions').set({ status: 'done' }).execute();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it leaves an action whose lease another runner holds', async () => {
  const ctx = await setupTest();

  await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const lease = await claimAction(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(lease).toBeNull();
});
