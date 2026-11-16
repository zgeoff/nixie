import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readTaskSetup } from '../task/read-task-setup';
import type { TasksTables } from '../types';
import { seedClosedTask } from './seed-closed-task';
import { seedConversationStep } from './seed-conversation-step';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves a started task in the closed state', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedClosedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const row = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ state: 'closed' });
});

test('it starts the task with the options it is given', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedClosedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { limits: { turns: 3, dollars: 1 } },
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  invariant(setup?.kind === 'started');

  expect(setup.limits).toStrictEqual({ turns: 3, dollars: 1 });
});
