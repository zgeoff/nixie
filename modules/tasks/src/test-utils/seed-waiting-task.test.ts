import { expect, test } from 'bun:test';
import { readTaskSetup } from '../task/read-task-setup';
import type { TasksTables } from '../types';
import { seedConversationStep } from './seed-conversation-step';
import { seedWaitingTask } from './seed-waiting-task';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves a started task in the waiting state', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedWaitingTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const row = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ state: 'waiting' });
});

test('it starts the task with the options it is given', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedWaitingTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { limits: { turns: 3, dollars: 1 } },
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup?.limits).toStrictEqual({ turns: 3, dollars: 1 });
});
