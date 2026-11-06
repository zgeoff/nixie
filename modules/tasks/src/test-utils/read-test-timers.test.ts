import { expect, test } from 'bun:test';
import { runDueTimers } from '../run-due-timers';
import { writeStepCommit } from '../write-step-commit';
import { createTestClaim } from './create-test-claim';
import { readTestTimers } from './read-test-timers';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it reads each timer with its task, its due time and when it fired, in the order set', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check the oven');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }, { dueAt: 1_600_000 }],
  });

  ctx.clock.advance(60_000);

  await runDueTimers(ctx.context);

  const timers = await readTestTimers(ctx.writer);

  expect(timers).toStrictEqual([
    { taskID: claim.lease.workID, dueAt: 1_060_000, firedAt: 1_060_000 },
    { taskID: claim.lease.workID, dueAt: 1_600_000, firedAt: null },
  ]);
});
