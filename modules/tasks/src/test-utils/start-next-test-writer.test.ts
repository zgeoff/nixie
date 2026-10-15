import { expect, test } from 'bun:test';
import { createTask } from '../create-task';
import type { TasksTables } from '../types';
import { startNextTestWriter } from './start-next-test-writer';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it starts a writer at the next epoch and hands it to the context', async () => {
  const ctx = await setupTest();
  const next = await startNextTestWriter(ctx);

  expect(next.writer.epoch).toBe(2);
  expect(next.context.log.writer).toBe(next.writer);
});

test('it keeps the rows the writer before it committed', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');
  const next = await startNextTestWriter(ctx);

  const task = await next.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('task_id')
    .executeTakeFirstOrThrow();

  expect(task.task_id).toBe(taskID);
});

test('it keeps the clock where it stood', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);

  const next = await startNextTestWriter(ctx);

  expect(next.context.clock.now()).toBe(1_060_000);
});
