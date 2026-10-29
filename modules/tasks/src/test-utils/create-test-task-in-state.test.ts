import { expect, test } from 'bun:test';
import type { TaskState, TasksTables } from '../types';
import type { TestTaskState } from './create-test-task-in-state';
import { createTestTaskInState } from './create-test-task-in-state';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test.each<[TestTaskState, TaskState, number]>([
  ['ready', 'ready', 0],
  ['running', 'running', 0],
  ['pause_requested', 'running', 1],
  ['waiting', 'waiting', 0],
  ['paused', 'paused', 0],
  ['stopped', 'stopped', 0],
  ['failed', 'failed', 0],
  ['done', 'done', 0],
  ['closed', 'closed', 0],
])('it creates a task in the %s state', async (wanted, state, pauseRequested) => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, wanted);

  const row = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'pause_requested'])
    .where('task_id', '=', task.taskID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ state, pause_requested: pauseRequested });
});

test('it hands back the claim of a running task', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'running');

  expect(task.claim?.lease.workID).toBe(task.taskID);
});
