import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { LeaseLostError } from '../utils/lease-lost-error';
import { claimLease } from './claim-lease';
import { requireLease } from './require-lease';

function setupTest() {
  return startTestTasks();
}

test('it passes while the lease stands as claimed', async () => {
  const ctx = await setupTest();

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  invariant(lease);

  const check = withWriteTransaction(ctx.writer, (tx) => requireLease(tx, lease, ctx.clock.now()));

  await check;

  expect(check).resolves.toBeUndefined();
});

test('it throws once the lease expired', async () => {
  const ctx = await setupTest();

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  invariant(lease);

  ctx.clock.advance(60_000);

  const check = withWriteTransaction(ctx.writer, (tx) => requireLease(tx, lease, ctx.clock.now()));

  await check.catch(() => {});

  expect(check).rejects.toThrowWithMessage(
    LeaseLostError,
    'lease lost on action work-1 at generation 1',
  );
});

test('it throws once another runner claimed the work', async () => {
  const ctx = await setupTest();

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  invariant(lease);

  ctx.clock.advance(60_000);

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-b',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve({ workID: 'work-1', taskID: 'work-1' }),
  });

  const check = withWriteTransaction(ctx.writer, (tx) => requireLease(tx, lease, ctx.clock.now()));

  await check.catch(() => {});

  expect(check).rejects.toThrowWithMessage(
    LeaseLostError,
    'lease lost on action work-1 at generation 1',
  );
});
