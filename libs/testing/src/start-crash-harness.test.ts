import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startCrashHarness } from './start-crash-harness';

function setupTest() {
  const harness = startCrashHarness({
    entry: join(import.meta.dir, 'test-utils/run-stub-nixie.ts'),
    env: {},
    startMs: 1_000_000,
  });

  return { harness };
}

test('it starts each nixie on the clock time the test has reached', async () => {
  const ctx = setupTest();

  await ctx.harness.advance(5000);

  const nixie = ctx.harness.start();

  await nixie.ready;

  const now = await nixie.request('now', null);

  expect(now).toBe(1_005_000);
});

test('it advances the clock in every nixie still running', async () => {
  const ctx = setupTest();
  const first = ctx.harness.start();
  const second = ctx.harness.start();

  await Promise.all([first.ready, second.ready]);
  await ctx.harness.advance(60_000);

  const firstNow = await first.request('now', null);
  const secondNow = await second.request('now', null);

  expect(firstNow).toBe(1_060_000);
  expect(secondNow).toBe(1_060_000);
  expect(ctx.harness.now()).toBe(1_060_000);
});

test('it refuses an advance while a nixie it started is not yet ready, which would miss it', () => {
  const ctx = setupTest();

  ctx.harness.start();

  expect(ctx.harness.advance(1000)).rejects.toThrow(
    'a nixie is not ready yet, so it would miss the advance',
  );
});

test('it settles an advance once every runner it woke sleeps again', async () => {
  const ctx = setupTest();
  const nixie = ctx.harness.start();

  await nixie.ready;

  await nixie.request('startPoll', 1000);

  await expect(ctx.harness.advance(1000, { settle: true, settleTimeoutMs: 200 })).toResolve();
});

test('it refuses a settled advance when a runner it woke does not sleep again', async () => {
  const ctx = setupTest();
  const nixie = ctx.harness.start();

  await nixie.ready;

  await nixie.request('sleepOnce', 1000);

  expect(ctx.harness.advance(1000, { settle: true, settleTimeoutMs: 200 })).rejects.toThrow(
    'a runner the advance woke did not sleep again',
  );
});

test('it kills every nixie still running when the test finishes', async () => {
  const ctx = setupTest();
  const nixie = ctx.harness.start();

  await nixie.ready;

  onTestFinished(async () => {
    const exit = await nixie.exited;

    expect(exit).toStrictEqual({ code: null, signal: 'SIGKILL' });
  });
});
