import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { claimTestAction } from '../test-utils/claim-test-action';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { seedDoneAction } from '../test-utils/seed-done-action';
import { startTestActions } from '../test-utils/start-test-actions';
import { readTasksWithPendingActions } from './read-tasks-with-pending-actions';
import { runActionAttempt } from './run-action-attempt';

async function setupTest() {
  const actions = await startTestActions();

  return {
    ...actions,
    readPendingTaskIDs: () =>
      withWriteTransaction(actions.writer, (tx) => readTasksWithPendingActions(tx)),
  };
}

test('it lists the task of each action with no outcome, once for each action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.archive',
    actionHash: 'sha256:archive-1',
    arguments: { folder: 'receipts' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const taskIDs = await ctx.readPendingTaskIDs();

  expect(taskIDs).toStrictEqual([step.lease.workID, step.lease.workID]);
});

test('it lists an action whose attempt is open', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const lease = await claimTestAction(ctx.context, { holder: 'test', leaseMs: 60_000 });

  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();

  const attempt = runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [
        'test.send',
        {
          run: async () => {
            started.resolve();

            await finish.promise;

            return { kind: 'success', result: {} };
          },
        },
      ],
    ]),
    leaseMs: 60_000,
  });

  await started.promise;

  const taskIDs = await ctx.readPendingTaskIDs();

  finish.resolve();

  await attempt;

  expect(taskIDs).toStrictEqual([step.lease.workID]);
});

test('it leaves out an action that finished', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await seedDoneAction(ctx.context, { step });

  const taskIDs = await ctx.readPendingTaskIDs();

  expect(taskIDs).toStrictEqual([]);
});

test('it leaves out an action that a stop cancelled', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const taskIDs = await ctx.readPendingTaskIDs();

  expect(taskIDs).toStrictEqual([]);
});
