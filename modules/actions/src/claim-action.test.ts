import { expect, test } from 'bun:test';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { writeStepCommit, writeTaskControl, writeTaskResume } from '@heynixie/tasks';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { buildActionSeeder } from './test-utils/build-action-seeder';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';
import { waitForActionOutcome } from './wait-for-action-outcome';

async function setupTest() {
  const actions = await startTestActions();

  const definitions = { snapshotHash: 'sha256:test' };

  return {
    ...actions,
    db: actions.writer.db.$extendTables<ActionsTables>(),
    seed: buildActionSeeder({ context: actions.context }),
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

test('it holds an action that never started once its task is closed', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'close' });

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

test('it claims no queued action while nixie is paused', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await ctx.seed.action({ step });
  await ctx.pauseNixie();

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it claims no action with a started attempt and a due retry while nixie is paused', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await ctx.seed.pendingRetryScheduledAction({ step });
  await ctx.pauseNixie();

  ctx.clock.advance(3_600_000);

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease).toBeNull();
});

test('it claims the action of an exempt task while nixie is paused, though a paused task has the earlier action', async () => {
  const ctx = await setupTest();
  const pausedStep = await createTestStep(ctx.context);

  await ctx.seed.action({ step: pausedStep });

  ctx.clock.advance(1000);

  const exemptStep = await createTestStep(ctx.context);
  const exempt = await ctx.seed.action({ step: exemptStep });

  await ctx.pauseNixie();
  await ctx.exemptTask(exemptStep.lease.workID);

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease?.workID).toBe(exempt.action_id);
});

test('it claims the action of a done task once the resume of the task exempts it while nixie is paused', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const queued = await ctx.seed.action({ step });

  await writeStepCommit(ctx.context, step, { next: 'done', records: [], acknowledged: [] });

  await ctx.pauseNixie();

  await writeTaskResume(ctx.context, { taskID: step.lease.workID, by: 'host' });

  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(lease?.workID).toBe(queued.action_id);
});
