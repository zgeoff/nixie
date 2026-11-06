import { expect, test } from 'bun:test';
import { claimTask } from '../claim-task';
import { createTask } from '../create-task';
import { readTestTasks } from './read-test-tasks';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test("it reads each task's ID, state, last inbox sequence and creation sequence, oldest first", async () => {
  const ctx = await setupTest();
  const first = await createTask(ctx.context, 'sort the receipts');
  const second = await createTask(ctx.context, 'book the dentist');

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const tasks = await readTestTasks(ctx.context);

  expect(tasks).toStrictEqual([
    { id: first, state: 'running', lastInboxSequence: 0, createdSequence: 1 },
    { id: second, state: 'ready', lastInboxSequence: 0, createdSequence: 2 },
  ]);
});

test('it reads no tasks before any task is created', async () => {
  const ctx = await setupTest();
  const tasks = await readTestTasks(ctx.context);

  expect(tasks).toStrictEqual([]);
});
