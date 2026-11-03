import { expect, test } from 'bun:test';
import type { TasksTables } from '../types';
import { seedConversationStep } from './seed-conversation-step';
import { startTestTasks } from './start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves the conversation running a step over an unread message of the user', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'read_cursor', 'last_inbox_sequence'])
    .executeTakeFirstOrThrow();

  expect(step.claim.lease.workID).toBe('conversation');

  expect(task).toStrictEqual({
    state: 'running',
    read_cursor: expect.any(Number),
    last_inbox_sequence: step.messageSequence,
  });
});
