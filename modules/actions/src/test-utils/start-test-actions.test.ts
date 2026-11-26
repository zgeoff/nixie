import { expect, onTestFinished, test } from 'bun:test';
import { stat } from 'node:fs/promises';
import { startTestActions } from './start-test-actions';

test('it starts a writer whose log folds the tasks, actions and proposals projections, on a test clock', async () => {
  const ctx = await startTestActions();

  const tables = ctx.context.log.projections.map((projection) => projection.table);

  expect(tables).toStrictEqual([
    'threads',
    'nixie_pause',
    'pause_exemptions',
    'recoveries',
    'spend_stop',
    'spend_route_stops',
    'spend_route_holds',
    'spend_provider_stops',
    'spend_provider_holds',
    'tasks',
    'timers',
    'task_messages',
    'task_runs',
    'actions',
    'proposals',
  ]);

  expect(ctx.context.clock.now()).toBe(1_000_000);
});

test('it removes the data directory when the test finishes', async () => {
  const ctx = await startTestActions();

  onTestFinished(() => {
    expect(stat(ctx.dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  expect(ctx.dataDir).toBeString();
});
