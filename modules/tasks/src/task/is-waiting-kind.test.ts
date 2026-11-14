import { expect, test } from 'bun:test';
import { isWaitingKind } from './is-waiting-kind';

test.each([
  ['question', true],
  ['request', true],
  ['progress', false],
  ['report', false],
  ['reply', false],
  ['chat', false],
] as const)('it reads a %s as waiting: %p', (kind, expected) => {
  expect(isWaitingKind(kind)).toBe(expected);
});
