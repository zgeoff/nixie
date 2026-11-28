import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedChildTask } from './seed-child-task';
import { seedConversationStep } from './seed-conversation-step';
import { seedTask } from './seed-task';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it starts a task that the parent task started', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const parentID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const childID = await seedChildTask(ctx.context, {
    parentID,
    name: 'Harbour hours',
    brief: 'Find when the harbour office opens.',
  });

  const row = await ctx.db
    .selectFrom('tasks')
    .select('started_by')
    .where('task_id', '=', childID)
    .executeTakeFirstOrThrow();

  expect(row.started_by).toBe(parentID);
});
