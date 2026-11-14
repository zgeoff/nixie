import { expect, test } from 'bun:test';
import { claimTask, readOpenRun, writeFailedTurnSpend } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readLateSpend } from './read-late-spend';
import { readRunUsage } from './read-run-usage';

async function setupTest() {
  const tasks = await startTestTasks();

  const seed = buildSeeder(tasks);

  return {
    tasks,
    seed,
    startRun: async () => {
      const starter = await seed.conversationStep();

      const taskID = await seed.task({
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
      });

      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      const run = await readOpenRun(tasks.context.log.writer.db, taskID);

      invariant(run, 'the claim opened a task run');

      return run;
    },
  };
}

test('it sums only the spend of the task run past the sequence', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.04,
  });

  const usage = await readRunUsage(ctx.tasks.context, run);

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.01,
  });

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: 'an-earlier-run',
    dollars: 0.5,
  });

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.02,
  });

  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence);

  expect(dollars).toBeCloseTo(0.03, 10);
});

test('it reads no spend when none was recorded past the sequence', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.04,
  });

  const usage = await readRunUsage(ctx.tasks.context, run);
  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence);

  expect(dollars).toBe(0);
});
