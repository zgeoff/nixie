import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeStepError } from './write-step-error';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it returns a task whose step threw to ready, after the retry delay', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({
    state: 'ready',
    step_errors: 1,
    claimable_at: 1_030_000,
    started_step_key: null,
  });
});

test('it fails a task once its steps threw the limit of times in a row', async () => {
  const ctx = await setupTest();
  const first = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, first, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 2,
    retryDelayMs: 30_000,
  });
  ctx.clock.advance(30_000);

  const second = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(second);

  await writeStepError(ctx.context, second, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 2,
    retryDelayMs: 30_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({ state: 'failed', step_errors: 2 });
});

test('it keeps the error text in the erasable fields of its record', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 2 });

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'task.step_errored',
      payload: {
        taskID: claim.lease.workID,
        stepKey: claim.stepKey,
        nextState: 'ready',
        errors: 1,
        claimableAt: 1_030_000,
      },
      erasable: { status: 'readable', fields: { message: 'the model profile is unreachable' } },
    },
  ]);
});
