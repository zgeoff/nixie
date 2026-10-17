import { expect, test } from 'bun:test';
import { formatFailedTurns } from './format-failed-turns';

test.each([
  [1, 'the last turn failed'],
  [3, 'the last 3 turns failed'],
])('it names %d failed turns in a row as %s', (errors, expected) => {
  expect(formatFailedTurns(errors)).toBe(expected);
});
