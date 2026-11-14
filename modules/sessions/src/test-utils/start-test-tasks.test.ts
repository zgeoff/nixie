import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { readTestTasks } from '@heynixie/tasks/test-utils';
import { startTestTasks } from './start-test-tasks';

test('it starts a writer whose log folds the tasks projections, on a test clock', async () => {
  const ctx = await startTestTasks();

  expect(ctx.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'nixie_pause',
    'pause_exemptions',
    'recoveries',
    'tasks',
    'timers',
    'task_messages',
  ]);

  expect(ctx.context.clock.now()).toBe(1_000_000);
  expect(ctx.writer.epoch).toBe(1);
});

test('it types the writer handle for the tasks tables', async () => {
  const ctx = await startTestTasks();
  const tasks = await readTestTasks(ctx.writer);

  expect(ctx.db.getExecutor()).toBe(ctx.writer.db.getExecutor());
  expect(tasks).toStrictEqual([]);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await startTestTasks();

  onTestFinished(() => {
    expect(stat(ctx.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(ctx.dataDir).toBeString();
});
