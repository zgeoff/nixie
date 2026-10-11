import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { startTestTasks } from './start-test-tasks';

test('it starts a writer whose log folds the tasks projections, on a test clock', async () => {
  const ctx = await startTestTasks();

  expect(ctx.context.log.projections.map((projection) => projection.table)).toStrictEqual([
    'threads',
    'tasks',
    'timers',
  ]);
  expect(ctx.context.clock.now()).toBe(1_000_000);
  expect(ctx.writer.epoch).toBe(1);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await startTestTasks();

  onTestFinished(() => {
    expect(stat(ctx.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(ctx.dataDir).toBeString();
});
