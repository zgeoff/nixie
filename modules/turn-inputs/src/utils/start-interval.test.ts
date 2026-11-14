import { expect, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { startInterval } from './start-interval';

test('it runs once for each interval of the clock and stops', async () => {
  const clock = buildTestClock(0);
  const runs: number[] = [];

  const interval = startInterval({
    clock,
    intervalMs: 1000,
    run: () => {
      runs.push(clock.now());

      return Promise.resolve();
    },
    onError: () => {},
  });

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(1000);

  await waitForCondition(() => runs.length === 1);
  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(1000);

  await waitForCondition(() => runs.length === 2);

  await interval.stop();

  expect(runs).toStrictEqual([1000, 2000]);
});

test('it goes on after a run throws', async () => {
  const clock = buildTestClock(0);
  const errors: unknown[] = [];

  const interval = startInterval({
    clock,
    intervalMs: 1000,
    run: () => Promise.reject(new Error('a fault')),
    onError: (error) => {
      errors.push(error);
    },
  });

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(1000);

  await waitForCondition(() => errors.length === 1);

  await interval.stop();

  expect(errors).toHaveLength(1);
});
