import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedConversationStep } from './seed-conversation-step';
import { seedDriftedTask } from './seed-drifted-task';
import { startTestTasks } from './start-test-tasks';

test('it leaves a task whose step error count its records do not hold', async () => {
  const ctx = await startTestTasks();

  await seedConversationStep(ctx.context);
  await seedDriftedTask(ctx.context, 'conversation');

  const row = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('step_errors')
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ step_errors: 7 });
});
