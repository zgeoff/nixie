import { expect, test } from 'bun:test';
import { claimTestLease } from './claim-test-lease';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it claims the named work for the holder for the duration', async () => {
  const ctx = await setupTest();

  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });

  expect(lease).toStrictEqual({
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    generation: 1,
    epoch: ctx.writer.epoch,
    expiresAt: 1_060_000,
  });
});
