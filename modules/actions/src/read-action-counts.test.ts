import { expect, test } from 'bun:test';
import { writeTaskControl } from '@heynixie/tasks';
import { createAllowedAction } from './create-allowed-action';
import { readActionCounts } from './read-action-counts';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it counts the cancelled and the started actions of a stopped task apart', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
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

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const counts = await readActionCounts(ctx.context, [step.lease.workID]);

  expect(counts).toStrictEqual(
    new Map([[step.lease.workID, { queued: 0, started: 1, cancelled: 1 }]]),
  );
});

test('it counts the unstarted action of a running task as queued', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const counts = await readActionCounts(ctx.context, [step.lease.workID]);

  expect(counts).toStrictEqual(
    new Map([[step.lease.workID, { queued: 1, started: 0, cancelled: 0 }]]),
  );
});

test('it counts nothing for a task with no action', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const counts = await readActionCounts(ctx.context, [step.lease.workID]);

  expect(counts).toStrictEqual(
    new Map([[step.lease.workID, { queued: 0, started: 0, cancelled: 0 }]]),
  );
});

test('it leaves a settled action out of every count', async () => {
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

  const counts = await readActionCounts(ctx.context, [step.lease.workID]);

  expect(counts).toStrictEqual(
    new Map([[step.lease.workID, { queued: 0, started: 0, cancelled: 0 }]]),
  );
});
