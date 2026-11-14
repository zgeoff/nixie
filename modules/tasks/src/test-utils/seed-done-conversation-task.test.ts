import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedDoneConversationTask } from './seed-done-conversation-task';
import { startTestTasks } from './start-test-tasks';

test('it leaves the conversation task in the done state', async () => {
  const ctx = await startTestTasks();

  await seedDoneConversationTask(ctx.context);

  const row = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ state: 'done' });
});
