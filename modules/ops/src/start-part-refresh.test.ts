import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { startPartRefresh } from './start-part-refresh';
import type { PartReport } from './types';

function setupTest() {
  const clock = buildTestClock(0);

  return { clock };
}

test('it reports a part unready before its first check ends', () => {
  const ctx = setupTest();

  const refresh = startPartRefresh({
    checks: { imp_runtime: () => Promise.withResolvers<never>().promise },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(async () => {
    ctx.clock.advance(2000);

    await refresh.stop();
  });

  expect(refresh.read('imp_runtime')).toStrictEqual({
    isReady: false,
    reason: 'the part is not checked yet',
  });
});

test('it reports each part with its last check once the first round ends', async () => {
  const ctx = setupTest();

  const refresh = startPartRefresh({
    checks: {
      imp_runtime: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: false, reason: 'the data volume is 92% full' }),
    },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => refresh.read('disk').reason !== 'the part is not checked yet');

  expect(refresh.read('imp_runtime')).toStrictEqual({ isReady: true, reason: null });

  expect(refresh.read('disk')).toStrictEqual({
    isReady: false,
    reason: 'the data volume is 92% full',
  });
});

test('it reports a part whose check outlasts the timeout as unready', async () => {
  const ctx = setupTest();

  const refresh = startPartRefresh({
    checks: { imp_runtime: () => Promise.withResolvers<never>().promise },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(2000);

  await waitForCondition(
    () => refresh.read('imp_runtime').reason !== 'the part is not checked yet',
  );

  expect(refresh.read('imp_runtime')).toStrictEqual({
    isReady: false,
    reason: 'the check took longer than 2000 ms',
  });
});

test('it checks each part again once the interval passes', async () => {
  const ctx = setupTest();
  const disk: { report: PartReport } = { report: { isReady: true, reason: null } };

  const refresh = startPartRefresh({
    checks: { disk: () => Promise.resolve(disk.report) },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => refresh.read('disk').isReady);

  disk.report = { isReady: false, reason: 'the data volume is 95% full' };

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(5000);

  await waitForCondition(() => !refresh.read('disk').isReady);

  expect(refresh.read('disk')).toStrictEqual({
    isReady: false,
    reason: 'the data volume is 95% full',
  });
});

test('it never checks again before the interval passes', async () => {
  const ctx = setupTest();
  const check = mock(() => Promise.resolve({ isReady: true, reason: null }));

  const refresh = startPartRefresh({
    checks: { disk: check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  // the first round's report lands just before the interval's sleep starts
  await waitForCondition(() => refresh.read('disk').isReady);

  ctx.clock.advance(4999);

  expect(ctx.clock.countSleepers()).toBe(1);
  expect(check).toHaveBeenCalledOnce();
});

test('it answers with the last report while a later check runs', async () => {
  const ctx = setupTest();
  const runtime = { next: Promise.resolve<PartReport>({ isReady: true, reason: null }) };
  const check = mock(() => runtime.next);

  const refresh = startPartRefresh({
    checks: { imp_runtime: check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(async () => {
    ctx.clock.advance(2000);

    await refresh.stop();
  });

  // the first round's report lands just before the interval's sleep starts
  await waitForCondition(() => refresh.read('imp_runtime').isReady);

  runtime.next = Promise.withResolvers<PartReport>().promise;

  ctx.clock.advance(5000);

  await waitForCondition(() => check.mock.calls.length === 2);

  expect(refresh.read('imp_runtime')).toStrictEqual({ isReady: true, reason: null });
});

test('it stops checking once stopped', async () => {
  const ctx = setupTest();
  const check = mock(() => Promise.resolve({ isReady: true, reason: null }));

  const refresh = startPartRefresh({
    checks: { disk: check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  await waitForCondition(() => refresh.read('disk').isReady);

  await refresh.stop();

  ctx.clock.advance(5000);

  expect(check).toHaveBeenCalledOnce();
});
