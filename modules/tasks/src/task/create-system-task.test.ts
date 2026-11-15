import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestTasks } from '../test-utils/start-test-tasks';
import type { TasksTables } from '../types';
import { createSystemTask } from './create-system-task';

function setupTest() {
  return startTestTasks();
}

test('it creates a system task under its fixed ID, ready for its first step', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'sweeper');

  const task = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'is_conversation', 'state'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ task_id: 'sweeper', is_conversation: 0, state: 'ready' });
});

test('it leaves the system task be on every start after the first', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'sweeper');
  await createSystemTask(ctx.context, 'sweeper');

  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(records.map((read) => read.record.kind)).toStrictEqual(['task.created']);
});
