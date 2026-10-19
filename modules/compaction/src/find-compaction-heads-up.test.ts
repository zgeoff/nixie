import { expect, test } from 'bun:test';
import { findCompactionHeadsUp } from './find-compaction-heads-up';

test.each([
  ['at the heads-up', { size: 140_000, window: 200_000 }, 20_000],
  ['between the heads-up and the threshold', { size: 150_500, window: 200_000 }, 9500],
])('it gives the tokens left before compaction for a context %s', (_label, context, left) => {
  expect(findCompactionHeadsUp(context, { threshold: 0.8, headsUp: 0.7 })).toBe(left);
});

test.each([
  ['under the heads-up', { size: 139_999, window: 200_000 }],
  ['at the threshold', { size: 160_000, window: 200_000 }],
  ['past the threshold', { size: 170_000, window: 200_000 }],
])('it gives no heads-up for a context %s', (_label, context) => {
  expect(findCompactionHeadsUp(context, { threshold: 0.8, headsUp: 0.7 })).toBeNull();
});

test('it gives no heads-up after a turn that reported no context', () => {
  expect(findCompactionHeadsUp(null, { threshold: 0.8, headsUp: 0.7 })).toBeNull();
});
