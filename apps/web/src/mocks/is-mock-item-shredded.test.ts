import { expect, test } from 'bun:test';
import { isMockItemShredded } from './is-mock-item-shredded';

test.each([
  ['active', false],
  ['retired', false],
  ['forgetting', true],
  ['forgotten', true],
] as const)('it reads a %s item with no stated key as shredded: %p', (state, expected) => {
  expect(isMockItemShredded({ state })).toBe(expected);
});

test('it reads a forgetting item whose cleanup has not removed its key as not shredded', () => {
  expect(isMockItemShredded({ isShredded: false, state: 'forgetting' })).toBeFalse();
});
