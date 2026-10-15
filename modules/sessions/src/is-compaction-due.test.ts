import { expect, test } from 'bun:test';
import { isCompactionDue } from './is-compaction-due';

test.each([
  ['at the threshold', { size: 160_000, window: 200_000 }, true],
  ['past the threshold', { size: 170_000, window: 200_000 }, true],
  ['under the threshold', { size: 159_999, window: 200_000 }, false],
])('it reads a context %s of the window', (_label, context, isDue) => {
  expect(isCompactionDue(context, 0.8)).toBe(isDue);
});

test('it never compacts after a turn that reported no context', () => {
  expect(isCompactionDue(null, 0.8)).toBe(false);
});
