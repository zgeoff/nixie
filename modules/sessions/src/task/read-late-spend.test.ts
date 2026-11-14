import { expect, test } from 'bun:test';
import { writeFailedTurnSpend } from '@heynixie/tasks';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readLateSpend } from './read-late-spend';
import { readTaskUsage } from './read-task-usage';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    tasks,
    seed: buildSeeder(tasks),
    readThroughSequence: async (taskID: string) => {
      const usage = await readTaskUsage(tasks.context, taskID, null);

      return usage.throughSequence;
    },
  };
}

test('it sums only the spend records on the thread of the task past the sequence', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeFailedTurnSpend(ctx.tasks.context, { taskID, dollars: 0.04 });

  const throughSequence = await ctx.readThroughSequence(taskID);

  await writeFailedTurnSpend(ctx.tasks.context, { taskID, dollars: 0.01 });
  await writeFailedTurnSpend(ctx.tasks.context, { taskID: 'harbour-charts', dollars: 0.5 });
  await writeFailedTurnSpend(ctx.tasks.context, { taskID, dollars: 0.02 });

  const dollars = await readLateSpend(ctx.tasks.context, taskID, throughSequence);

  expect(dollars).toBeCloseTo(0.03, 10);
});

test('it reads no spend when none was recorded past the sequence', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await writeFailedTurnSpend(ctx.tasks.context, { taskID, dollars: 0.04 });

  const throughSequence = await ctx.readThroughSequence(taskID);
  const dollars = await readLateSpend(ctx.tasks.context, taskID, throughSequence);

  expect(dollars).toBe(0);
});
