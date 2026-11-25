import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { writeStepCommit, writeTaskControl } from '@heynixie/tasks';
import { createTestStep } from '../test-utils/create-test-step';
import { queueTestAction } from '../test-utils/queue-test-action';
import { startTestActions } from '../test-utils/start-test-actions';
import type { ActionsTables } from '../types';
import { buildHeldCheck } from './build-held-check';
import { makeQueueRunnerActions } from './make-queue-runner-actions';

async function setupTest() {
  const actions = await startTestActions();

  const queue = makeQueueRunnerActions(actions.context);

  return {
    ...actions,
    db: actions.writer.db.$extendTables<ActionsTables>(),
    queueRunnerAction: (taskID: string, stepKey: string) =>
      withWriteTransaction(actions.writer, (tx) =>
        queue(tx, {
          taskID,
          stepKey,
          actions: [
            {
              tool: 'coding.stop',
              args: { session: 'atc:cloud.3f9a1c2e.00000001', origin: 'started' },
              hashParts: ['stop'],
              causedBy: { kind: 'record', sequence: 1 },
            },
          ],
        }),
      ),
  };
}

test.each([
  ['pause', 'held', 1],
  ['close', 'held', 1],
  ['stop', 'not held', 0],
] as const)('it reads an unstarted action after a %s as %s', async (control, _label, expected) => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  await queueTestAction(ctx.context, {
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

  await queueTestAction(ctx.context, {
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

test.each([
  ['pause', 'step-1', 'held', 1],
  ['close', 'step-1', 'held', 1],
  ['pause', 'ended:stopped:task', 'not held', 0],
  ['close', 'ended:stopped:task', 'not held', 0],
] as const)(
  'it reads an unstarted runner action after a %s, queued under step key %s, as %s',
  async (control, stepKey, _label, expected) => {
    const ctx = await setupTest();
    const step = await createTestStep(ctx.context);

    await ctx.queueRunnerAction(step.lease.workID, stepKey);

    await writeStepCommit(ctx.context, step, { next: 'wait', records: [], acknowledged: [] });
    await writeTaskControl(ctx.context, { taskID: step.lease.workID, control });

    const row = await ctx.db
      .selectFrom('actions')
      .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
      .select((eb) => buildHeldCheck(eb).as('is_held'))
      .executeTakeFirstOrThrow();

    expect(row.is_held).toBe(expected);
  },
);
