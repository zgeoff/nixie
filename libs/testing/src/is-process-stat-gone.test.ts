import { expect, test } from 'bun:test';
import { isProcessStatGone } from './is-process-stat-gone';

test.each([
  [false, 'running', '4242 (sleep) R 1 4242 4242 0 -1 4194560'],
  [false, 'sleeping', '4242 (sleep) S 1 4242 4242 0 -1 4194560'],
  [false, 'stopped', '4242 (sleep) T 1 4242 4242 0 -1 4194560'],
  [true, 'zombie', '4242 (sleep) Z 1 4242 4242 0 -1 4194564'],
  [true, 'dead', '4242 (sleep) X 1 4242 4242 0 -1 4194564'],
])('it answers %p for the stat line of a %s process', (expected, _label, stat) => {
  expect(isProcessStatGone(stat)).toBe(expected);
});

test('it reads the state after the last parenthesis when the name holds one', () => {
  expect(isProcessStatGone('4242 (odd) Z (name) S 1 4242 4242 0 -1 4194560')).toBe(false);
});
