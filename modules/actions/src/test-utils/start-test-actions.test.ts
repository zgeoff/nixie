import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { startTestActions } from './start-test-actions';

test('it starts a writer whose log folds the tasks and actions projections, on a test clock', async () => {
  const ctx = await startTestActions();

  const tables = ctx.context.log.projections.map((projection) => projection.table);

  expect(tables).toStrictEqual(['threads', 'tasks', 'timers', 'actions']);
  expect(ctx.context.clock.now()).toBe(1_000_000);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await startTestActions();

  onTestFinished(() => {
    expect(stat(ctx.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(ctx.dataDir).toBeString();
});
