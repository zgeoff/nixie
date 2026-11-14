import { expect, test } from 'bun:test';
import { createSystemTask } from '../create-system-task';
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

test('it records the error on the conversation task when an older task is ready', async () => {
  const ctx = await startTestTasks();

  await createSystemTask(ctx.context, 'housekeeping');
  await seedFailedConversationTurn(ctx.context);

  const rows = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'step_errors'])
    .where('task_id', 'in', ['conversation', 'housekeeping'])
    .orderBy('task_id')
    .execute();

  expect(rows).toStrictEqual([
    { task_id: 'conversation', step_errors: 1 },
    { task_id: 'housekeeping', step_errors: 0 },
  ]);
});
