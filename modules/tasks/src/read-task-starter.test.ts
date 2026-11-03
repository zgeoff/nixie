import { expect, test } from 'bun:test';
import { readTaskStarter } from './read-task-starter';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it reads the task that started a task', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find tides.',
  });

  const read = await readTaskStarter(ctx.context, taskID);

  expect(read).toBe('conversation');
});

test('it reads no starter for a task that no start started', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find tides.',
  });

  const read = await readTaskStarter(ctx.context, 'conversation');

  expect(read).toBeNull();
});

test('it reads no starter for an unknown task', async () => {
  const ctx = await setupTest();
  const starter = await readTaskStarter(ctx.context, 'k3vq8m2xpa');

  expect(starter).toBeNull();
});
