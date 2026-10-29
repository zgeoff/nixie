import { expect, test } from 'bun:test';
import { isFinishedState } from './is-finished-state';

test.each([
  ['done', true],
  ['failed', true],
  ['closed', true],
  ['ready', false],
  ['running', false],
  ['waiting', false],
  ['paused', false],
  ['stopped', false],
] as const)('it reads a %s task as finished: %p', (state, expected) => {
  expect(isFinishedState(state)).toBe(expected);
});
