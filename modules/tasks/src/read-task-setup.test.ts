import { expect, test } from 'bun:test';
import { readTaskSetup } from './read-task-setup';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedHeldTask } from './test-utils/seed-held-task';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTaskLimitRaise } from './write-task-limit-raise';

function setupTest() {
  return startTestTasks();
}

test('it reads the starter, the options and the limits of a started task', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find tides.',
    options: { persona: 'default', memory: 'read', limits: { turns: 12, dollars: 3 } },
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup).toStrictEqual({
    startedBy: 'conversation',
    options: {
      model: null,
      profile: null,
      persona: 'default',
      memory: 'read',
      tools: ['tasks.list', 'task.message', 'time.now'],
      report: 'wake',
      limits: { turns: 12, dollars: 3 },
    },
    limits: { turns: 12, dollars: 3 },
  });
});

test('it reads the limits of the newest raise', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 9 } });

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup?.limits).toStrictEqual({ turns: 9, dollars: 1 });
});

test('it reads no setup for a task that no start started', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  const setup = await readTaskSetup(ctx.context, 'conversation');

  expect(setup).toBeNull();
});

test('it reads no setup for an unknown task', async () => {
  const ctx = await setupTest();
  const setup = await readTaskSetup(ctx.context, 'k3vq8m2xpa');

  expect(setup).toBeNull();
});
