import { expect, test } from 'bun:test';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readTasksPausedByNixie } from './read-tasks-paused-by-nixie';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    pause: () =>
      withWriteTransaction(tasks.writer, (tx) =>
        pauseNixieInTransaction(tx, tasks.context.log, {
          cause: 'owner',
          recoveryID: null,
          by: 'owner',
          definitions: tasks.context.definitions(),
        }),
      ),
    exempt: (taskID: string) =>
      withWriteTransaction(tasks.writer, (tx) =>
        exemptTaskInTransaction(tx, tasks.context.log, {
          taskID,
          by: 'owner',
          definitions: tasks.context.definitions(),
        }),
      ),
    readPaused: (taskIDs: readonly string[]) => readTasksPausedByNixie(tasks.writer.db, taskIDs),
  };
}

test('it returns no task while nixie runs', async () => {
  const ctx = await setupTest();
  const paused = await ctx.readPaused(['task-a', 'task-b']);

  expect(paused).toStrictEqual(new Set());
});

test('it returns every task while nixie is paused', async () => {
  const ctx = await setupTest();

  await ctx.pause();

  const paused = await ctx.readPaused(['task-a', 'task-b']);

  expect(paused).toStrictEqual(new Set(['task-a', 'task-b']));
});

test('it leaves out a task that a resume of its own exempted', async () => {
  const ctx = await setupTest();

  await ctx.pause();
  await ctx.exempt('task-a');

  const paused = await ctx.readPaused(['task-a', 'task-b']);

  expect(paused).toStrictEqual(new Set(['task-b']));
});

test('it returns no task for no task IDs', async () => {
  const ctx = await setupTest();

  await ctx.pause();

  const paused = await ctx.readPaused([]);

  expect(paused).toStrictEqual(new Set());
});
