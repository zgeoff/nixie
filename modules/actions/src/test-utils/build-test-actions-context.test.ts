import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildTestActionsContext } from './build-test-actions-context';
import { startTestActions } from './start-test-actions';

test('it builds a context over the given log, clock and definitions', async () => {
  const actions = await startTestActions();

  const clock = createFakeClock({ startMs: 5 });

  const context = buildTestActionsContext({
    log: actions.context.log,
    clock,
    definitions: () => ({ snapshotHash: 'sha256:other' }),
  });

  expect([
    context.log === actions.context.log,
    context.clock.now(),
    context.definitions(),
  ]).toStrictEqual([true, 5, { snapshotHash: 'sha256:other' }]);
});
