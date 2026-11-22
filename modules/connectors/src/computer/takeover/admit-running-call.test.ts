import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { admitRunningCall, extendAdmissions } from './admit-running-call';
import type { RunningCall } from './wait-for-running-calls';
import { waitForRunningCalls } from './wait-for-running-calls';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });
  const hold = { isHeld: false };

  const admissions = {
    clock,
    running: new Set<RunningCall>(),
    admitted: new Set<RunningCall>(),
    isHeld: () => hold.isHeld,
    turnWaitMs: 30_000,
  };

  return {
    clock,
    hold,
    admissions,
    admit: () => admitRunningCall(admissions),
    wait: () => waitForRunningCalls({ clock, running: admissions.running }),
  };
}

test('it admits no call while a hold is open', () => {
  const ctx = setupTest();

  ctx.hold.isHeld = true;

  expect([ctx.admit(), ctx.admissions.running.size]).toStrictEqual([null, 0]);
});

test('it keeps a take-over waiting for an admitted call until the admission ends', async () => {
  const ctx = setupTest();
  const release = ctx.admit();
  const progress = { isSettled: false };

  const waitAndMark = async () => {
    const isDrained = await ctx.wait();

    progress.isSettled = true;

    return isDrained;
  };

  const result = waitAndMark();

  await Promise.resolve();
  await Promise.resolve();

  const settledWhileAdmitted = progress.isSettled;

  release?.();
  expect([settledWhileAdmitted, await result]).toStrictEqual([false, true]);
});

test('it ends an admission once however often its release runs', () => {
  const ctx = setupTest();
  const release = ctx.admit();

  release?.();
  release?.();
  expect([ctx.admissions.running.size, ctx.admissions.admitted.size]).toStrictEqual([0, 0]);
});

test('it gives up on an admitted call past the turn wait', async () => {
  const ctx = setupTest();

  ctx.admit();

  const result = ctx.wait();

  ctx.clock.advance(30_000);

  await expect(result).resolves.toBe(false);
});

test('#extendAdmissions moves an open admission up to the limit of its computer call', async () => {
  const ctx = setupTest();
  const release = ctx.admit();

  extendAdmissions(ctx.admissions.admitted, 1_090_000);

  const result = ctx.wait();

  ctx.clock.advance(60_000);
  release?.();

  await expect(result).resolves.toBe(true);
});

test('#extendAdmissions never moves an admission to an earlier limit', async () => {
  const ctx = setupTest();
  const release = ctx.admit();

  extendAdmissions(ctx.admissions.admitted, 1_010_000);

  const result = ctx.wait();

  ctx.clock.advance(20_000);
  release?.();

  await expect(result).resolves.toBe(true);
});
