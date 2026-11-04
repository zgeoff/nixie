import { expect, test } from 'bun:test';
import { readTaskSetup } from '../read-task-setup';
import type { TasksTables } from '../types';
import { seedConversationStep } from './seed-conversation-step';
import { seedStartedTask } from './seed-started-task';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves a ready task that the starter step started, and the starter as it was', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const rows = await ctx.db
    .selectFrom('tasks')
    .select(['task_id', 'state', 'started_by'])
    .orderBy('created_sequence')
    .execute();

  expect(rows).toStrictEqual([
    { task_id: 'conversation', state: 'running', started_by: null },
    { task_id: taskID, state: 'ready', started_by: 'conversation' },
  ]);
});

test('it starts the task with the options it is given over the default ones', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { model: 'second-look', profile: 'router-b', report: 'none' },
  });

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(setup?.options).toStrictEqual({
    model: 'second-look',
    profile: 'router-b',
    persona: 'none',
    memory: 'none',
    tools: ['tasks.list', 'task.message', 'time.now'],
    report: 'none',
    limits: { turns: 25, dollars: 2 },
  });
});
