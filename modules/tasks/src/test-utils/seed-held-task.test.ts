import { expect, test } from 'bun:test';
import { readTaskSetup } from '../read-task-setup';
import type { TasksTables } from '../types';
import { seedConversationStep } from './seed-conversation-step';
import { seedHeldTask } from './seed-held-task';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves a started task paused at the limits it is given', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const row = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'pause_requested'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  const setup = await readTaskSetup(ctx.context, taskID);

  expect(row).toStrictEqual({ state: 'paused', pause_requested: 0 });
  expect(setup?.limits).toStrictEqual({ turns: 3, dollars: 1 });
});
