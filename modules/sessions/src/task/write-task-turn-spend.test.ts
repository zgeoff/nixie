import { expect, test } from 'bun:test';
import { claimTask, readOpenRun } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readLateSpend } from './read-late-spend';
import { writeTaskTurnSpend } from './write-task-turn-spend';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, seed: buildSeeder(tasks) };
}

test("it counts the spend of a step that threw after its lease expired, under the step's task run", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Harbour charts',
    brief: 'Find the depth at the north mooring.',
  });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  invariant(run, 'the claim opened a task run');

  ctx.clock.advance(60_000);

  await writeTaskTurnSpend(
    { ...ctx.context, logger: () => {} },
    { taskID, taskRunID: run.runID },
    { failedDollars: 0.03 },
  );

  const spent = await readLateSpend(ctx.context, run, 0);

  expect(spent).toBeCloseTo(0.03, 10);
});

test('it writes nothing for a step that spent nothing', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Harbour charts',
    brief: 'Find the depth at the north mooring.',
  });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  invariant(run, 'the claim opened a task run');

  await writeTaskTurnSpend(
    { ...ctx.context, logger: () => {} },
    { taskID, taskRunID: run.runID },
    { failedDollars: null },
  );

  const spent = await readLateSpend(ctx.context, run, 0);

  expect(spent).toBe(0);
});
