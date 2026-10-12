import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startLeaseRenewal } from './start-lease-renewal';
import { claimTestLease } from './test-utils/claim-test-lease';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointID, TasksTables } from './types';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it leaves the lease as claimed until a third of its length passes', async () => {
  const ctx = await setupTest();
  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });
  const renewal = startLeaseRenewal(ctx.context, lease, 60_000);

  onTestFinished(() => renewal.stop());

  ctx.clock.advance(19_999);

  const row = await ctx.db.selectFrom('leases').select('expires_at').executeTakeFirstOrThrow();

  expect(row.expires_at).toBe(1_060_000);
});

test('it renews the lease a third of its length after the claim', async () => {
  const ctx = await setupTest();
  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });
  const renewal = startLeaseRenewal(ctx.context, lease, 60_000);

  onTestFinished(() => renewal.stop());

  ctx.clock.advance(20_000);

  // the renewal sleeps again once its renewal commits
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  const row = await ctx.db.selectFrom('leases').select('expires_at').executeTakeFirstOrThrow();

  expect(row.expires_at).toBe(1_080_000);
});

test('it renews again every third of the lease', async () => {
  const ctx = await setupTest();
  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });
  const renewal = startLeaseRenewal(ctx.context, lease, 60_000);

  onTestFinished(() => renewal.stop());
  ctx.clock.advance(20_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(20_000);

  // the renewal sleeps again once its renewal commits
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  const row = await ctx.db.selectFrom('leases').select('expires_at').executeTakeFirstOrThrow();

  expect(row.expires_at).toBe(1_100_000);
});

test('it aborts its signal when a renewal finds the lease lost', async () => {
  const ctx = await setupTest();
  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });
  const renewal = startLeaseRenewal(ctx.context, lease, 60_000);

  onTestFinished(() => renewal.stop());

  // the runner missed every renewal, so the lease expired before this one
  ctx.clock.advance(60_000);

  await waitForCondition(() => renewal.signal.aborted);

  const row = await ctx.db.selectFrom('leases').select('expires_at').executeTakeFirstOrThrow();

  expect(row.expires_at).toBe(1_060_000);
});

test('it stops renewing once stopped', async () => {
  const ctx = await setupTest();
  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });
  const renewal = startLeaseRenewal(ctx.context, lease, 60_000);

  await renewal.stop();
  ctx.clock.advance(20_000);

  const row = await ctx.db.selectFrom('leases').select('expires_at').executeTakeFirstOrThrow();

  expect(ctx.clock.countSleepers()).toBe(0);
  expect(row.expires_at).toBe(1_060_000);
});

test('it reaches renew.before and renew.after around each renewal', async () => {
  const ctx = await setupTest();
  const reached: FaultPointID[] = [];
  const lease = await claimTestLease(ctx.context, {
    kind: 'task',
    workID: 'work-1',
    holder: 'runner-a',
    durationMs: 60_000,
  });

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  const renewal = startLeaseRenewal(ctx.context, lease, 60_000);

  onTestFinished(() => renewal.stop());
  ctx.clock.advance(20_000);

  await waitForCondition(() => reached.length === 2);
  expect(reached).toStrictEqual(['renew.before', 'renew.after']);
});
