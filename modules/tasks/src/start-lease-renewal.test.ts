import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { claimLease } from './claim-lease';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startLeaseRenewal } from './start-lease-renewal';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointID, TasksTables } from './types';

async function setupTest() {
  const tasks = await startTestTasks();
  const lease = await claimLease(tasks.context, {
    kind: 'task',
    holder: 'runner-a',
    durationMs: 60_000,
    findCandidate: () => Promise.resolve('work-1'),
  });

  if (lease === null) {
    throw new Error('the setup claim found no work');
  }
  const readExpiry = async (): Promise<number | null> => {
    const row = await tasks.writer.db
      .$extendTables<TasksTables>()
      .selectFrom('leases')
      .select('expires_at')
      .executeTakeFirstOrThrow();

    return row.expires_at;
  };

  return { ...tasks, lease, readExpiry };
}

test('it renews the lease a third of its length after the claim, and not before', async () => {
  const ctx = await setupTest();
  const renewal = startLeaseRenewal(ctx.context, ctx.lease, 60_000);

  onTestFinished(() => renewal.stop());
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(19_999);

  const beforeDue = await ctx.readExpiry();

  ctx.clock.advance(1);
  await waitForCondition(async () => (await ctx.readExpiry()) === 1_080_000);

  expect(beforeDue).toBe(1_060_000);
});

test('it renews again every third of the lease', async () => {
  const ctx = await setupTest();
  const renewal = startLeaseRenewal(ctx.context, ctx.lease, 60_000);

  onTestFinished(() => renewal.stop());
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(20_000);
  await waitForCondition(async () => (await ctx.readExpiry()) === 1_080_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(20_000);

  await waitForCondition(async () => (await ctx.readExpiry()) === 1_100_000);
  expect(renewal.signal.aborted).toBeFalse();
});

test('it aborts its signal when a renewal finds the lease lost', async () => {
  const ctx = await setupTest();
  const renewal = startLeaseRenewal(ctx.context, ctx.lease, 60_000);

  onTestFinished(() => renewal.stop());
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  // the runner missed every renewal, so the lease expired before this one
  ctx.clock.advance(60_000);

  await waitForCondition(() => renewal.signal.aborted);

  const expiry = await ctx.readExpiry();

  expect(expiry).toBe(1_060_000);
});

test('it stops renewing once stopped', async () => {
  const ctx = await setupTest();
  const renewal = startLeaseRenewal(ctx.context, ctx.lease, 60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  await renewal.stop();
  ctx.clock.advance(20_000);

  const expiry = await ctx.readExpiry();

  expect(ctx.clock.countSleepers()).toBe(0);
  expect(expiry).toBe(1_060_000);
});

test('it reaches renew.before and renew.after around each renewal', async () => {
  const ctx = await setupTest();
  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  const renewal = startLeaseRenewal(ctx.context, ctx.lease, 60_000);

  onTestFinished(() => renewal.stop());
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(20_000);

  await waitForCondition(() => reached.length === 2);
  expect(reached).toStrictEqual(['renew.before', 'renew.after']);
});
