import { expect, mock, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { checkParts } from './check-parts';
import type { PartCheck } from './types';

test('it reports ready when every part is ready', async () => {
  const report = await checkParts(
    {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: true, reason: null }),
    },
    1000,
  );

  expect(report).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
  });
});

test('it reports unready when one part is unready, and names its reason', async () => {
  const report = await checkParts(
    {
      database: () => Promise.resolve({ isReady: true, reason: null }),
      disk: () => Promise.resolve({ isReady: false, reason: 'the data volume is 95% full' }),
    },
    1000,
  );

  expect(report).toStrictEqual({
    status: 'unready',
    parts: {
      database: { isReady: true, reason: null },
      disk: { isReady: false, reason: 'the data volume is 95% full' },
    },
  });
});

test('it reports a check that throws as unready with the error name alone', async () => {
  const report = await checkParts(
    { database: () => Promise.reject(new TypeError('the text of a message')) },
    1000,
  );

  expect(report.parts['database']).toStrictEqual({
    isReady: false,
    reason: 'the check failed: TypeError',
  });
});

test('it reports a check that never settles as unready once the timeout passes', async () => {
  const clock = buildTestClock(0);

  const pending = checkParts(
    { imp_host: () => Promise.withResolvers<never>().promise },
    2000,
    clock,
  );

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(2000);

  const report = await pending;

  expect(report.parts['imp_host']).toStrictEqual({
    isReady: false,
    reason: 'the check took longer than 2000 ms',
  });
});

test('it aborts the signal of a check that outlasts the timeout, so the check ends its calls', async () => {
  const clock = buildTestClock(0);
  const check = mock<PartCheck>(() => Promise.withResolvers<never>().promise);
  const pending = checkParts({ imp_host: check }, 2000, clock);

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(2000);

  await pending;

  expect(check.mock.calls[0]?.[0]?.aborted).toBe(true);
});

test('it waits on a check that never settles until the timeout passes', async () => {
  const clock = buildTestClock(0);

  const pending = checkParts(
    { imp_host: () => Promise.withResolvers<never>().promise },
    2000,
    clock,
  );

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(1999);

  expect(clock.countSleepers()).toBe(1);
  expect(Bun.peek.status(pending)).toBe('pending');
});

test('it ends the timeout of a check that settles in time', async () => {
  const clock = buildTestClock(0);

  await checkParts({ disk: () => Promise.resolve({ isReady: true, reason: null }) }, 2000, clock);

  expect(clock.countSleepers()).toBe(0);
});
