import { expect, test } from 'bun:test';
import { writeTaskControl } from '@heynixie/tasks';
import { buildCancelledCheck } from './build-cancelled-check';
import { createAllowedAction } from './create-allowed-action';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it matches an action that a stop cancelled', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const cancelled = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const rows = await ctx.db
    .selectFrom('actions')
    .select(['action_id'])
    .select((eb) => buildCancelledCheck(eb).as('is_cancelled'))
    .execute();

  expect(rows).toStrictEqual([{ action_id: cancelled.actionID, is_cancelled: 1 }]);
});

test('it matches no action that never met a stop', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const queued = await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const rows = await ctx.db
    .selectFrom('actions')
    .select(['action_id'])
    .select((eb) => buildCancelledCheck(eb).as('is_cancelled'))
    .execute();

  expect(rows).toStrictEqual([{ action_id: queued.actionID, is_cancelled: 0 }]);
});
