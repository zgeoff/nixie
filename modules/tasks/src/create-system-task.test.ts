import { expect, test } from 'bun:test';
import { createSystemTask } from './create-system-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

function setupTest() {
  return startTestTasks();
}

test('it creates a system task under its fixed ID, ready for its first step', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'memory-writer');

  const task = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'is_conversation', 'state'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ task_id: 'memory-writer', is_conversation: 0, state: 'ready' });
});

test('it leaves the system task be on every start after the first', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'memory-writer');
  await createSystemTask(ctx.context, 'memory-writer');

  const records = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('kind')
    .execute();

  expect(records).toStrictEqual([{ kind: 'task.created' }]);
});
