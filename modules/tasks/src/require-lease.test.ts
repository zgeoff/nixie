import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimLease } from './claim-lease';
import { LeaseLostError } from './lease-lost-error';
import { requireLease } from './require-lease';
import { startTestTasks } from './test-utils/start-test-tasks';

function setupTest() {
  return startTestTasks();
}

test('it passes while the lease stands as claimed', async () => {
  const ctx = await setupTest();

  const lease = await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve('work-1'),
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
    readCandidate: () => Promise.resolve('work-1'),
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
    readCandidate: () => Promise.resolve('work-1'),
  });

  invariant(lease);

  ctx.clock.advance(60_000);

  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-b',
    durationMs: 60_000,
    readCandidate: () => Promise.resolve('work-1'),
  });

  const check = withWriteTransaction(ctx.writer, (tx) => requireLease(tx, lease, ctx.clock.now()));

  await check.catch(() => {});

  expect(check).rejects.toThrowWithMessage(
    LeaseLostError,
    'lease lost on action work-1 at generation 1',
  );
});
