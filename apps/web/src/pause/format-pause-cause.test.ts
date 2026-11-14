import { expect, test } from 'bun:test';
import { formatPauseCause } from './format-pause-cause';

test.each([
  ['restore', 'a restore'],
  ['owner', 'you'],
  ['spending', 'the spending limit'],
] as const)('it words the cause %s as %s', (cause, words) => {
  expect(formatPauseCause(cause)).toBe(words);
});
