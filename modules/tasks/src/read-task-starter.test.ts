import { expect, test } from 'bun:test';
import { readTaskStarter } from './read-task-starter';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it reads the task that started a task', async () => {
  const ctx = await setupTest();
  const taskID = await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });
  const starter = await readTaskStarter(ctx.context, taskID);

  expect(starter).toBe('conversation');
});

test('it reads no starter for a task that no start started', async () => {
  const ctx = await setupTest();

  await seedStartedTask(ctx.context, { name: 'Tide tables', brief: 'Find tides.' });

  const starter = await readTaskStarter(ctx.context, 'conversation');

  expect(starter).toBeNull();
});

test('it reads no starter for an unknown task', async () => {
  const ctx = await setupTest();
  const starter = await readTaskStarter(ctx.context, 'k3vq8m2xpa');

  expect(starter).toBeNull();
});
