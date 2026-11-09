import { expect, test } from 'bun:test';
import { LeaseLostError, claimTask } from '@heynixie/tasks';
import { seedConversationStep, seedStartedTask } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { readTaskUsage } from './read-task-usage';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTaskTurnSpend } from './write-task-turn-spend';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    claimStartedTask: async (taskID: string) => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      return claim;
    },
    readUsage: (taskID: string) =>
      readTaskUsage(tasks.context, taskID, {
        input: 3,
        cacheWrite: 3,
        cacheWrite1h: 3,
        cachedInput: 0.3,
        output: 15,
      }),
  };
}

test('it refuses the limit pause of a completed turn whose lease is lost, and counts its spend', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Harbour charts',
    brief: 'Find the depth at the north mooring.',
  });

  const claim = await ctx.claimStartedTask(taskID);

  ctx.clock.advance(60_000);

  const refusal = await writeTaskTurnSpend(
    { ...ctx.context, logger: () => {} },
    {
      lease: claim.lease,
      stepKey: claim.stepKey,
      startedBy: 'conversation',
      limits: { turns: 25, dollars: 0.03 },
    },
    { reached: { turns: 1, dollars: 0.03 }, failedDollars: null, pausedDollars: 0.03 },
  ).then(
    () => null,
    (error: unknown) => error,
  );

  const used = await ctx.readUsage(taskID);

  expect(refusal).toBeInstanceOf(LeaseLostError);
  expect(used).toStrictEqual({ turns: 0, dollars: 0.03 });
});
