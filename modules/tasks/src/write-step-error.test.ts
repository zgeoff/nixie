import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { claimTask } from './claim-task';
import { createTask } from './create-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeStepError } from './write-step-error';

async function setupTest() {
  const tasks = await startTestTasks();
  const db = tasks.writer.db.$extendTables<TasksTables>();
  const taskID = await createTask(tasks.context, 'tidy the inbox');
  const readTask = () => db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  return { ...tasks, db, taskID, readTask };
}

test('it returns a task whose step threw to ready, after the retry delay', async () => {
  const ctx = await setupTest();
  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the setup claim found no task');
  }

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const task = await ctx.readTask();

  expect(task).toMatchObject({
    state: 'ready',
    step_errors: 1,
    claimable_at: 1_030_000,
    started_step_key: null,
  });
});

test('it fails a task once its steps threw the limit of times in a row', async () => {
  const ctx = await setupTest();
  const failure = { error: new Error('boom'), maxStepErrors: 2, retryDelayMs: 30_000 };
  const first = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 }).then(
    (claim) => claim ?? Promise.reject(new Error('the first claim found no task')),
  );

  await writeStepError(ctx.context, first, failure);
  ctx.clock.advance(30_000);

  const second = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 }).then(
    (claim) => claim ?? Promise.reject(new Error('the second claim found no task')),
  );

  await writeStepError(ctx.context, second, failure);

  const task = await ctx.readTask();

  expect(task).toMatchObject({ state: 'failed', step_errors: 2 });
});

test('it keeps the error text in the erasable fields of its record', async () => {
  const ctx = await setupTest();
  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the setup claim found no task');
  }

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
        taskID: ctx.taskID,
        stepKey: claim.stepKey,
        nextState: 'ready',
        errors: 1,
        claimableAt: 1_030_000,
      },
      erasable: { status: 'readable', fields: { message: 'the model profile is unreachable' } },
    },
  ]);
});
