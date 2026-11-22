import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { RunningCall } from './wait-for-running-calls';
import { waitForRunningCalls } from './wait-for-running-calls';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const running = new Set<RunningCall>();

  const addCall = (endsAtMs: number) => {
    const ended = Promise.withResolvers<void>();
    const call: RunningCall = { endsAtMs, ended: ended.promise };

    running.add(call);

    return { call, end: () => ended.resolve() };
  };

  return { clock, running, addCall, wait: () => waitForRunningCalls({ clock, running }) };
}

test('it answers true at once when no call runs', async () => {
  const ctx = setupTest();

  await expect(ctx.wait()).resolves.toBe(true);
});

test('it answers true when the calls that ran at the start end, though a later call still runs', async () => {
  const ctx = setupTest();
  const original = ctx.addCall(1_060_000);
  const result = ctx.wait();

  ctx.addCall(1_090_000);
  original.end();

  await expect(result).resolves.toBe(true);
});

test('it answers false when a call outlasts its own limit', async () => {
  const ctx = setupTest();

  ctx.addCall(1_060_000);

  const result = ctx.wait();

  ctx.clock.advance(60_000);

  await expect(result).resolves.toBe(false);
});

test('it waits to the new limit of a call that took its turn late', async () => {
  const ctx = setupTest();
  const original = ctx.addCall(1_060_000);
  const progress = { isSettled: false };

  const waitAndMark = async () => {
    const isDrained = await ctx.wait();

    progress.isSettled = true;

    return isDrained;
  };

  const result = waitAndMark();

  original.call.endsAtMs = 1_100_000;

  ctx.clock.advance(60_000);

  await Promise.resolve();
  await Promise.resolve();

  const settledAtOldLimit = progress.isSettled;

  ctx.clock.advance(40_000);

  expect([settledAtOldLimit, await result]).toStrictEqual([false, false]);
});

test('it answers false at the limit of the first call to overrun, before a later call limit', async () => {
  const ctx = setupTest();

  ctx.addCall(1_030_000);
  ctx.addCall(1_090_000);

  const result = ctx.wait();

  ctx.clock.advance(30_000);

  await expect(result).resolves.toBe(false);
});

test('it ignores the limit of a call that has ended and waits for the others', async () => {
  const ctx = setupTest();
  const quick = ctx.addCall(1_030_000);

  ctx.addCall(1_090_000);

  const result = ctx.wait();

  quick.end();

  await Promise.resolve();
  await Promise.resolve();

  ctx.clock.advance(30_000);

  const progress = { isSettled: false };

  const markWhenSettled = async () => {
    await result;

    progress.isSettled = true;
  };

  void markWhenSettled();

  await Promise.resolve();
  await Promise.resolve();

  const settledAtEndedLimit = progress.isSettled;

  ctx.clock.advance(60_000);

  expect([settledAtEndedLimit, await result]).toStrictEqual([false, false]);
});
