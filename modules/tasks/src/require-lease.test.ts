import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { claimLease } from './claim-lease';
import { LeaseLostError } from './lease-lost-error';
import { requireLease } from './require-lease';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();
  const lease = await claimLease(tasks.context, {
    kind: 'action',
    holder: 'runner-a',
    durationMs: 60_000,
    findCandidate: () => Promise.resolve('work-1'),
  });

  if (lease === null) {
    throw new Error('the setup claim found no work');
  }
  return { ...tasks, lease };
}

test('it passes while the lease stands as claimed', async () => {
  const ctx = await setupTest();

  const check = withWriteTransaction(ctx.writer, (tx) =>
    requireLease(tx, ctx.lease, ctx.clock.now()),
  );

  await check;

  expect(check).resolves.toBeUndefined();
});

test('it throws once the lease expired', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);

  const check = withWriteTransaction(ctx.writer, (tx) =>
    requireLease(tx, ctx.lease, ctx.clock.now()),
  );

  await check.catch(() => {});

  expect(check).rejects.toThrowWithMessage(
    LeaseLostError,
    'lease lost on action work-1 at generation 1',
  );
});

test('it throws once another runner claimed the work', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);
  await claimLease(ctx.context, {
    kind: 'action',
    holder: 'runner-b',
    durationMs: 60_000,
    findCandidate: () => Promise.resolve('work-1'),
  });

  const check = withWriteTransaction(ctx.writer, (tx) =>
    requireLease(tx, ctx.lease, ctx.clock.now()),
  );

  await check.catch(() => {});

  expect(check).rejects.toThrow(LeaseLostError);
});
