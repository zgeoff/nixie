import { expect, test } from 'bun:test';
import { planRotation } from './plan-rotation';

test('it rotates to the valid value 300 ms after the 2nd call result', () => {
  expect(planRotation({ count: 2, seconds: 4 }, 1000)).toStrictEqual([
    {
      kind: 'rotate-later',
      value: 'valid',
      reason: 'same value, model request in flight',
      delayMs: 4300,
    },
  ]);
});

test('it swaps in a junk value and back during the 4th call, with a probe after each', () => {
  expect(planRotation({ count: 4, seconds: 4 }, 1000)).toStrictEqual([
    { kind: 'rotate', value: 'junk', reason: 'between model requests' },
    { kind: 'probe', reason: 'junk value live' },
    { kind: 'rotate', value: 'valid', reason: 'between model requests' },
    { kind: 'probe', reason: 'valid value back' },
  ]);
});

test('it leaves a junk value across the request after the 6th call, then restores it', () => {
  expect(planRotation({ count: 6, seconds: 3 }, 2500)).toStrictEqual([
    { kind: 'rotate', value: 'junk', reason: 'across the next model request' },
    {
      kind: 'rotate-later',
      value: 'valid',
      reason: 'restore 2500 ms after the result',
      delayMs: 5500,
    },
  ]);
});

test.each([1, 3, 5, 7, 8, 9])('it plans no rotation at call %i', (count) => {
  expect(planRotation({ count, seconds: 4 }, 1000)).toStrictEqual([]);
});
