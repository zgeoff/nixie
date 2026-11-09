import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { probePauseRequested } from './probe-pause-requested';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
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
  };
}

test('it reads a pause that the user asked for while the task runs', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await ctx.claimStartedTask(taskID);

  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  const isPauseRequested = await probePauseRequested(ctx.writer.db, taskID);

  expect(isPauseRequested).toBeTrue();
});

test('it reads no pause request of a running task that the user left alone', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await ctx.claimStartedTask(taskID);

  const isPauseRequested = await probePauseRequested(ctx.writer.db, taskID);

  expect(isPauseRequested).toBeFalse();
});
