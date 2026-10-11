import { expect, test } from 'bun:test';
import { createConversationTask } from './create-conversation-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

test('it creates the conversation as a waiting task flagged as the conversation', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);

  const task = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'is_conversation', 'state'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ task_id: 'conversation', is_conversation: 1, state: 'waiting' });
});

test('it leaves the conversation be on every start after the first', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);
  await createConversationTask(ctx.context);

  const records = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('kind')
    .execute();

  expect(records).toStrictEqual([{ kind: 'task.created' }]);
});
