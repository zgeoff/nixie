import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeFailedTurnSpend } from './write-failed-turn-spend';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    claimStartedTask: async (taskID: string) => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      return claim;
    },
    readSpends: async () => {
      const spends = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.failed_turn_spent'],
      });

      return spends.map((entry) => ({
        thread: entry.record.thread,
        payload: entry.record.payload,
      }));
    },
  };
}

test("it writes the failed turn's dollars on the task's thread", async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Harbour charts',
    brief: 'Find the depth at the north mooring.',
  });

  await writeFailedTurnSpend(ctx.context, { taskID, dollars: 0.03 });

  const spends = await ctx.readSpends();

  expect(spends).toStrictEqual([{ thread: taskID, payload: { taskID, dollars: 0.03 } }]);
});

test('it writes the spend of a step that lost its lease to a stop', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Harbour charts',
    brief: 'Find the depth at the north mooring.',
  });

  await ctx.claimStartedTask(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'stop' });
  await writeFailedTurnSpend(ctx.context, { taskID, dollars: 0.03 });

  const spends = await ctx.readSpends();

  expect(spends).toStrictEqual([{ thread: taskID, payload: { taskID, dollars: 0.03 } }]);
});
