import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { claimTask } from './claim-task';
import { createTask } from './create-task';
import { startTaskRunners } from './start-task-runners';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { StepResult, TasksTables } from './types';
import { writeStepCommit } from './write-step-commit';

async function setupTest() {
  const tasks = await startTestTasks();
  const db = tasks.writer.db.$extendTables<TasksTables>();

  return { ...tasks, db };
}

test('it runs 3 steps at once by default', async () => {
  const ctx = await setupTest();
  const held = Promise.withResolvers<void>();
  const running = new Set<string>();

  await Promise.all(['a', 'b', 'c', 'd'].map((brief) => createTask(ctx.context, brief)));

  const runners = startTaskRunners(ctx.context, {
    runStep: async (input): Promise<StepResult> => {
      running.add(input.taskID);
      await held.promise;
      return { next: 'done', records: [], acknowledged: [] };
    },
    onError: () => {},
  });

  onTestFinished(async () => {
    held.resolve();
    await runners.stop(0);
  });

  // 3 runners renew their leases and the timer runner polls, so every runner has settled
  await waitForCondition(() => running.size === 3 && ctx.clock.countSleepers() === 4);

  const waiting = await ctx.db
    .selectFrom('tasks')
    .select('task_id')
    .where('state', '=', 'ready')
    .execute();

  expect(running.size).toBe(3);
  expect(waiting).toHaveLength(1);
});

test('it runs a claimed step and commits its result', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');
  const runners = startTaskRunners(ctx.context, {
    runStep: () => Promise.resolve<StepResult>({ next: 'done', records: [], acknowledged: [] }),
    onError: () => {},
  });

  onTestFinished(() => runners.stop(0));

  await waitForCondition(async () => {
    const task = await ctx.db
      .selectFrom('tasks')
      .select('state')
      .where('task_id', '=', taskID)
      .executeTakeFirstOrThrow();

    return task.state === 'done';
  });
  expect(runners).toBeObject();
});

test('it fires a due timer on its next poll', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'check back in a minute');

  const claim = await claimTask(ctx.context, { holder: 'setup', leaseMs: 60_000 }).then(
    (found) => found ?? Promise.reject(new Error('the setup claim found no task')),
  );

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  const runners = startTaskRunners(ctx.context, {
    runStep: () => Promise.resolve<StepResult>({ next: 'wait', records: [], acknowledged: [] }),
    onError: () => {},
  });

  onTestFinished(() => runners.stop(0));
  await waitForCondition(() => ctx.clock.countSleepers() === 4);
  ctx.clock.advance(60_000);

  await waitForCondition(async () => {
    const timer = await ctx.db.selectFrom('timers').select('fired_at').executeTakeFirstOrThrow();

    return timer.fired_at === 1_060_000;
  });
  expect(ctx.clock.now()).toBe(1_060_000);
});
