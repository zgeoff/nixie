import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedStartedTask } from './seed-started-task';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves a ready task that the conversation started, beside a waiting conversation', async () => {
  const ctx = await setupTest();

  const taskID = await seedStartedTask(ctx.context, {
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const rows = await ctx.db
    .selectFrom('tasks')
    .select(['task_id', 'state', 'started_by'])
    .orderBy('created_sequence')
    .execute();

  expect(rows).toStrictEqual([
    { task_id: 'conversation', state: 'waiting', started_by: null },
    { task_id: taskID, state: 'ready', started_by: 'conversation' },
  ]);
});
