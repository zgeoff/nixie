import { expect, test } from 'bun:test';
import { writeStepCommit, writeTaskControl } from '@heynixie/tasks';
import { buildHeldCheck } from './build-held-check';
import { createAllowedAction } from './create-allowed-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test.each([
  ['pause', 'held', 1],
  ['close', 'held', 1],
  ['stop', 'not held', 0],
] as const)('it reads an unstarted action after a %s as %s', async (control, _label, expected) => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });
  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control });

  const row = await ctx.db
    .selectFrom('actions')
    .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
    .select((eb) => buildHeldCheck(eb).as('is_held'))
    .executeTakeFirstOrThrow();

  expect(row.is_held).toBe(expected);
});

test('it never holds an action with a started attempt', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await ctx.db.updateTable('actions').set({ attempt_count: 1 }).execute();

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'close' });

  const row = await ctx.db
    .selectFrom('actions')
    .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
    .select((eb) => buildHeldCheck(eb).as('is_held'))
    .executeTakeFirstOrThrow();

  expect(row.is_held).toBe(0);
});
