import { expect, test } from 'bun:test';
import { claimTestLease } from './claim-test-lease';
import { createTestClaim } from './create-test-claim';
import { readTestLeases } from './read-test-leases';
import { startTestTasks } from './start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it reads each lease with its kind, its work and its holder, in kind order', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'water the ferns');

  await claimTestLease(ctx.context, {
    kind: 'action',
    workID: 'action-ferns',
    holder: 'runner-b',
    durationMs: 60_000,
  });

  const leases = await readTestLeases(ctx.writer);

  expect(leases).toStrictEqual([
    { kind: 'action', workID: 'action-ferns', holder: 'runner-b', generation: 1 },
    { kind: 'task', workID: claim.lease.workID, holder: 'runner-a', generation: 1 },
  ]);
});

test('it reads no leases before any work is claimed', async () => {
  const ctx = await setupTest();
  const leases = await readTestLeases(ctx.writer);

  expect(leases).toStrictEqual([]);
});
