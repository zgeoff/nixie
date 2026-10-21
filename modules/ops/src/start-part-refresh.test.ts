import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildStubCheck, buildTestClock, waitForCondition } from '@heynixie/testing';
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

test.each([['constructor'], ['__proto__'], ['toString']])(
  'it reports a part named %s unready before its first check ends',
  (part) => {
    const ctx = setupTest();

    const refresh = startPartRefresh({
      // A literal __proto__ key sets the prototype, so the test builds the object with fromEntries.
      checks: Object.fromEntries([[part, () => Promise.withResolvers<never>().promise]]),
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    });

    onTestFinished(async () => {
      ctx.clock.advance(2000);

      await refresh.stop();
    });

    expect(refresh.read(part)).toStrictEqual({
      isReady: false,
      reason: 'the part is not checked yet',
    });
  },
);

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

test('it skips a part whose check still runs past its timeout in later rounds', async () => {
  const ctx = setupTest();
  const stuck = mock(() => Promise.withResolvers<never>().promise);
  const disk = mock(() => Promise.resolve({ isReady: true, reason: null }));

  const refresh = startPartRefresh({
    checks: { imp_runtime: stuck, disk },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(2000);

  await waitForCondition(
    () => !refresh.read('imp_runtime').isReady && refresh.read('disk').isReady,
  );

  ctx.clock.advance(5000);

  await waitForCondition(() => disk.mock.calls.length === 2);

  expect(stuck).toHaveBeenCalledOnce();

  expect(refresh.read('imp_runtime')).toStrictEqual({
    isReady: false,
    reason: 'the check took longer than 2000 ms',
  });
});

test('it checks a part again once its check that outlasted the timeout settles', async () => {
  const ctx = setupTest();
  const slow = Promise.withResolvers<PartReport>();
  const stub = buildStubCheck(() => slow.promise);

  const refresh = startPartRefresh({
    checks: { imp_runtime: stub.check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(2000);

  await waitForCondition(
    () => refresh.read('imp_runtime').reason === 'the check took longer than 2000 ms',
  );

  stub.answerWith(() => Promise.resolve({ isReady: true, reason: null }));
  slow.resolve({ isReady: false, reason: 'impd does not answer' });

  await slow.promise;

  ctx.clock.advance(5000);

  await waitForCondition(() => refresh.read('imp_runtime').isReady);

  expect(stub.check).toHaveBeenCalledTimes(2);
});

test('it reports a check that rejects as unready, and checks the part again once the interval passes', async () => {
  const ctx = setupTest();

  const stub = buildStubCheck<PartReport>(() =>
    Promise.reject(new TypeError('impd refused the call')),
  );

  const refresh = startPartRefresh({
    checks: { imp_runtime: stub.check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(
    () => refresh.read('imp_runtime').reason === 'the check failed: TypeError',
  );

  const failed = refresh.read('imp_runtime');

  stub.answerWith(() => Promise.resolve({ isReady: true, reason: null }));
  ctx.clock.advance(5000);

  await waitForCondition(() => refresh.read('imp_runtime').isReady);

  expect(failed).toStrictEqual({ isReady: false, reason: 'the check failed: TypeError' });
  expect(refresh.read('imp_runtime')).toStrictEqual({ isReady: true, reason: null });
});

test('it checks each part again once the interval passes', async () => {
  const ctx = setupTest();
  const stub = buildStubCheck<PartReport>(() => Promise.resolve({ isReady: true, reason: null }));

  const refresh = startPartRefresh({
    checks: { disk: stub.check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => refresh.read('disk').isReady);

  stub.answerWith(() => Promise.resolve({ isReady: false, reason: 'the data volume is 95% full' }));

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

  await waitForCondition(() => refresh.read('disk').isReady);

  ctx.clock.advance(4999);

  expect(ctx.clock.countSleepers()).toBe(1);
  expect(check).toHaveBeenCalledOnce();
});

test('it answers with the last report while a later check runs', async () => {
  const ctx = setupTest();
  const stub = buildStubCheck<PartReport>(() => Promise.resolve({ isReady: true, reason: null }));

  const refresh = startPartRefresh({
    checks: { imp_runtime: stub.check },
    clock: ctx.clock,
    intervalMs: 5000,
    timeoutMs: 2000,
  });

  onTestFinished(async () => {
    ctx.clock.advance(2000);

    await refresh.stop();
  });

  await waitForCondition(() => refresh.read('imp_runtime').isReady);

  stub.answerWith(() => Promise.withResolvers<PartReport>().promise);
  ctx.clock.advance(5000);

  await waitForCondition(() => stub.check.mock.calls.length === 2);

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
