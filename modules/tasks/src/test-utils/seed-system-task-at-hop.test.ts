import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedSystemTaskAtHop } from './seed-system-task-at-hop';
import { startTestTasks } from './start-test-tasks';

test('it leaves a system task at the hop it is given', async () => {
  const ctx = await startTestTasks();

  await seedSystemTaskAtHop(ctx.context, { taskID: 'sweeper', hop: 3 });

  const row = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'step_hop'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ task_id: 'sweeper', step_hop: 3 });
});
