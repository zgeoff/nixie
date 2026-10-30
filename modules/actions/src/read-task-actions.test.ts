import { expect, test } from 'bun:test';
import { writeTaskControl } from '@heynixie/tasks';
import { createAllowedAction } from './create-allowed-action';
import { readTaskActions } from './read-task-actions';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it splits the pending actions of a task into queued and started', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const started = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.archive',
    actionHash: 'sha256:archive-1',
    arguments: { folder: 'receipts' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db
    .updateTable('actions')
    .set({ attempt_count: 1 })
    .where('action_id', '=', started.actionID)
    .execute();

  const actions = await readTaskActions(ctx.context, step.lease.workID);

  expect(actions).toStrictEqual({
    queued: [{ actionID: queued.actionID, tool: 'test.send' }],
    started: [{ actionID: started.actionID, tool: 'test.archive' }],
  });
});

test('it leaves out the actions a stop cancelled', async () => {
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

  const actions = await readTaskActions(ctx.context, step.lease.workID);

  expect(actions).toStrictEqual({ queued: [], started: [] });
});

test('it leaves out a settled action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const settled = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db
    .updateTable('actions')
    .set({ status: 'done', attempt_count: 1 })
    .where('action_id', '=', settled.actionID)
    .execute();

  const actions = await readTaskActions(ctx.context, step.lease.workID);

  expect(actions).toStrictEqual({ queued: [], started: [] });
});
