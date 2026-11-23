import { expect, test } from 'bun:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createFakeClock } from '@zgeoff/testing/clock';
import { admitRunningCall, findAdmission } from './admit-running-call';
import type { RunningCall } from './wait-for-running-calls';
import { waitForRunningCalls } from './wait-for-running-calls';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });
  const hold = { isHeld: false };

  const admissions = {
    clock,
    running: new Set<RunningCall>(),
    admitted: new Set<RunningCall>(),
    scope: new AsyncLocalStorage<RunningCall>(),
    isHeld: () => hold.isHeld,
    turnWaitMs: 30_000,
  };

  return {
    clock,
    hold,
    admissions,
    admit: () => admitRunningCall(admissions),
    find: () => findAdmission(admissions),
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
  const admission = ctx.admit();
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

  admission?.release();
  expect([settledWhileAdmitted, await result]).toStrictEqual([false, true]);
});

test('it ends an admission once however often its release runs', () => {
  const ctx = setupTest();
  const admission = ctx.admit();

  admission?.release();
  admission?.release();
  expect([ctx.admissions.running.size, ctx.admissions.admitted.size]).toStrictEqual([0, 0]);
});

test('it gives up on an admitted call past the turn wait', async () => {
  const ctx = setupTest();

  ctx.admit();

  const result = ctx.wait();

  ctx.clock.advance(30_000);

  const isCleared = await result;

  expect(isCleared).toBe(false);
});

test('#findAdmission finds the admission inside its work, past an await', async () => {
  const ctx = setupTest();
  const admission = ctx.admit();

  const found = await admission?.run(async () => {
    await Promise.resolve();

    return ctx.find();
  });

  expect(found).toStrictEqual({ endsAtMs: 1_030_000, ended: expect.any(Promise) });
});

test('#findAdmission finds no admission outside its work', () => {
  const ctx = setupTest();

  ctx.admit();

  expect(ctx.find()).toBeNull();
});

test('#findAdmission finds no admission inside its work once it is released', async () => {
  const ctx = setupTest();
  const admission = ctx.admit();

  const found = await admission?.run(() => {
    admission.release();

    return Promise.resolve(ctx.find());
  });

  expect(found).toBeNull();
});
