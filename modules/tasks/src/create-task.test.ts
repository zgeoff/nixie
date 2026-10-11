import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createTask } from './create-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

test('it creates a ready task with its brief in the erasable fields', async () => {
  const ctx = await startTestTasks();

  const taskID = await createTask(ctx.context, 'keep the backlog moving today');

  const task = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .selectAll()
    .executeTakeFirstOrThrow();
  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(task).toStrictEqual({
    task_id: taskID,
    is_conversation: 0,
    state: 'ready',
    read_cursor: 0,
    last_inbox_sequence: 0,
    committed_steps: 0,
    started_step_key: null,
    step_errors: 0,
    claimable_at: 0,
    session_boundary: null,
    created_sequence: 1,
    updated_sequence: 1,
  });
  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'task.created',
      thread: taskID,
      payload: { taskID, isConversation: false, state: 'ready' },
      erasable: { status: 'readable', fields: { brief: 'keep the backlog moving today' } },
    },
  ]);
});

test('it gives each task a random ID', async () => {
  const ctx = await startTestTasks();

  const first = await createTask(ctx.context, 'first');
  const second = await createTask(ctx.context, 'second');

  expect(first).toBeString();
  expect(first).not.toBe(second);
});
