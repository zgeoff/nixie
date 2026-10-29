import { expect, test } from 'bun:test';
import { writeTaskControl } from '@heynixie/tasks';
import { createAllowedAction } from './create-allowed-action';
import { readCancelledActionIDs } from './read-cancelled-action-ids';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it reads only the actions that a stop cancelled before their first attempt', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const unstarted = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const started = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-2',
    arguments: { to: 'office' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db
    .updateTable('actions')
    .set({ attempt_count: 1 })
    .where('action_id', '=', started.actionID)
    .execute();

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const cancelled = await readCancelledActionIDs(ctx.context, [
    unstarted.actionID,
    started.actionID,
  ]);

  expect([...cancelled]).toStrictEqual([unstarted.actionID]);
});

test('it reads no action when it is given none', async () => {
  const ctx = await setupTest();
  const cancelled = await readCancelledActionIDs(ctx.context, []);

  expect(cancelled).toStrictEqual(new Set());
});
