import { expect, test } from 'bun:test';
import { isItemLapsed } from './is-item-lapsed';

test.each([
  ['an active item whose end time passed', 'active', 1000, true],
  ['an active item whose end time is now', 'active', 2000, true],
  ['an active item whose end time is ahead', 'active', 3000, false],
  ['an active item with no end time', 'active', null, false],
  ['a retired item whose end time passed', 'retired', 1000, false],
] as const)('it reads %s as lapsed: %p', (_label, state, until, expected) => {
  expect(isItemLapsed({ state, until }, 2000)).toBe(expected);
});
