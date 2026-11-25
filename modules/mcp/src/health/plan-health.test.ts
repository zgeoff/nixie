import { expect, test } from 'bun:test';
import { planHealth } from './plan-health';
import { initialHealth } from './types';
import type { ServerHealth } from './types';

test('it backs the next try off from 1 minute and writes no change for a first failure', () => {
  expect(planHealth(initialHealth, { kind: 'failed', cause: 'timeout' }, 1000)).toStrictEqual({
    next: {
      failures: 1,
      nextTryAtMs: 61_000,
      lastError: 'timeout',
      hasPassed: false,
      isUnhealthy: false,
    },
    change: null,
  });
});

test('it doubles the wait after each failure and stops at 1 hour', () => {
  const waits = [1, 2, 3, 4, 5, 6, 7, 8].map((failures) => {
    const health: ServerHealth = { ...initialHealth, failures: failures - 1 };

    return (planHealth(health, { kind: 'failed', cause: 'error' }, 0).next.nextTryAtMs ?? 0) / 1000;
  });

  expect(waits).toStrictEqual([60, 120, 240, 480, 960, 1920, 3600, 3600]);
});

test('it marks the server unhealthy on the third failure in a row, and only then', () => {
  const failedOnce = planHealth(initialHealth, { kind: 'failed', cause: 'timeout' }, 1000).next;
  const second = planHealth(failedOnce, { kind: 'failed', cause: 'refused' }, 2000).next;
  const third = planHealth(second, { kind: 'failed', cause: 'refused' }, 3000);
  const fourth = planHealth(third.next, { kind: 'failed', cause: 'refused' }, 4000);

  expect([third.change, fourth.change]).toStrictEqual([
    { isUnhealthy: true, lastError: 'refused', nextTryAtMs: 3000 + 240_000 },
    null,
  ]);
});

test('it writes one recovery change when an unhealthy server passes, and none for a server that was never unhealthy', () => {
  const failedOnce = planHealth(initialHealth, { kind: 'failed', cause: 'timeout' }, 1000).next;
  const unhealthy: ServerHealth = { ...initialHealth, failures: 3, isUnhealthy: true };

  expect([
    planHealth(unhealthy, { kind: 'passed' }, 5000).change,
    planHealth(failedOnce, { kind: 'passed' }, 5000).change,
  ]).toStrictEqual([{ isUnhealthy: false, lastError: null, nextTryAtMs: null }, null]);
});

test('it resets the count on a pass', () => {
  const failedOnce = planHealth(initialHealth, { kind: 'failed', cause: 'timeout' }, 1000).next;

  expect(planHealth(failedOnce, { kind: 'passed' }, 5000).next).toStrictEqual({
    failures: 0,
    nextTryAtMs: null,
    lastError: null,
    hasPassed: true,
    isUnhealthy: false,
  });
});
