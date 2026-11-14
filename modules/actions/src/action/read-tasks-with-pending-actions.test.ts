import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import { createTestStep } from '../test-utils/create-test-step';
import { startTestActions } from '../test-utils/start-test-actions';
import type { ActionsTables } from '../types';
import { createAllowedAction } from './create-allowed-action';
import { readTasksWithPendingActions } from './read-tasks-with-pending-actions';

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

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await createAllowedAction(ctx.context, {
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

  const action = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.writer.db
    .$extendTables<ActionsTables>()
    .updateTable('actions')
    .set({ attempt_count: 1, attempt_open: 1 })
    .where('action_id', '=', action.actionID)
    .execute();

  const taskIDs = await ctx.readPendingTaskIDs();

  expect(taskIDs).toStrictEqual([step.lease.workID]);
});

test('it leaves out an action that a stop cancelled', async () => {
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

  const taskIDs = await ctx.readPendingTaskIDs();

  expect(taskIDs).toStrictEqual([]);
});
