import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedFailedConversationTurn } from './seed-failed-conversation-turn';
import { startTestTasks } from './start-test-tasks';

test('it leaves the conversation ready to retry after one step error', async () => {
  const ctx = await startTestTasks();

  await seedFailedConversationTurn(ctx.context);

  const row = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'step_errors'])
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ state: 'ready', step_errors: 1 });
});
