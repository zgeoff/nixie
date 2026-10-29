import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createTestClaim } from './create-test-claim';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it claims the first step of a new task for runner-a under a 60 s lease', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  expect(claim).toStrictEqual({
    lease: {
      kind: 'task',
      workID: expect.toBeString(),
      holder: 'runner-a',
      generation: 1,
      epoch: ctx.writer.epoch,
      expiresAt: 1_060_000,
    },
    stepKey: `${claim.lease.workID}:1`,
    wake: { hop: 0, cause: { kind: 'carried' } },
    startSequence: 2,
  });
});

test('it creates the task with the brief it is given', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');
  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(entries.map((entry) => entry.record)).toIncludeAllPartialMembers([
    {
      kind: 'task.created',
      thread: claim.lease.workID,
      erasable: { status: 'readable', fields: { brief: 'check back in a minute' } },
    },
  ]);
});
