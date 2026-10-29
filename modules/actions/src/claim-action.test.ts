import { expect, test } from 'bun:test';
import { writeStepCommit, writeTaskControl } from '@heynixie/tasks';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';
import { waitForActionOutcome } from './wait-for-action-outcome';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it claims a due pending action with an action lease at generation 1', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toStrictEqual({
    kind: 'action',
    workID: queued.actionID,
    holder: 'runner-a',
    generation: 1,
    epoch: ctx.writer.epoch,
    expiresAt: 1_060_000,
  });
});

test('it leaves an action whose next attempt is not yet due', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ next_attempt_at: 1_030_000 }).execute();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it leaves a settled action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ status: 'done' }).execute();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it leaves an action whose lease another runner holds', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const lease = await claimAction(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it holds an action that never started while its task is paused', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'pause' });
  await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it never claims an action that a stop cancelled before its first attempt, after the task restarts', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'restart' });

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });
  const view = await waitForActionOutcome(ctx.context, queued.actionID, { timeoutMs: 0 });

  expect(lease).toBeNull();

  expect(view).toStrictEqual({
    status: 'cancelled',
    actionID: queued.actionID,
    message: 'the task was stopped before it ran',
  });
});

test('it claims an action with a started attempt after a stop and a restart of its task', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ attempt_count: 1 }).execute();

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'restart' });

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease?.workID).toBe(queued.actionID);
});

test('it claims an action with a started attempt while its task is paused', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'pause' });
  await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });

  await ctx.db.updateTable('actions').set({ attempt_count: 1 }).execute();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease?.workID).toBe(queued.actionID);
});
