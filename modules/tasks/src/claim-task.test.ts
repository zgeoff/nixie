import { expect, test } from 'bun:test';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createTask } from './create-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

async function setupTest() {
  const tasks = await startTestTasks();
  const db = tasks.writer.db.$extendTables<TasksTables>();

  return { ...tasks, db };
}

test('it moves a ready task to running and records the step it starts', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'started_step_key'])
    .executeTakeFirstOrThrow();
  const records = await ctx.db.selectFrom('records').select(['kind']).execute();

  expect(claim).toStrictEqual({
    lease: {
      kind: 'task',
      workID: taskID,
      holder: 'runner-a',
      generation: 1,
      epoch: ctx.writer.epoch,
      expiresAt: 1_060_000,
    },
    stepKey: `${taskID}:1`,
  });
  expect(task).toStrictEqual({ state: 'running', started_step_key: `${taskID}:1` });
  expect(records).toStrictEqual([{ kind: 'task.created' }, { kind: 'task.step_started' }]);
});

test('it never claims a waiting task', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(claim).toBeNull();
});

test('it never claims a running task whose lease still stands', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'tidy the inbox');
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });
  ctx.clock.advance(59_999);

  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(claim).toBeNull();
});

test('it reclaims a running task whose lease expired, marking the lost step interrupted', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });
  ctx.clock.advance(60_000);

  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const records = await ctx.db
    .selectFrom('records')
    .select(['kind'])
    .where('sequence', '>', 2)
    .execute();

  expect(claim).toMatchObject({
    lease: { holder: 'runner-b', generation: 2 },
    stepKey: `${taskID}:1`,
  });
  expect(records).toStrictEqual([{ kind: 'task.step_interrupted' }, { kind: 'task.step_started' }]);
});

test('it waits out the retry delay of a failed step before claiming the task again', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await ctx.db.updateTable('tasks').set({ claimable_at: 1_030_000 }).execute();

  const early = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  ctx.clock.advance(30_000);

  const due = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(early).toBeNull();
  expect(due?.lease.workID).toBe(taskID);
});
