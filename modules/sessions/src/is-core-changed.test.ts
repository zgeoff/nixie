import { expect, test } from 'bun:test';
import { isCoreChanged } from './is-core-changed';

test.each([
  ['the same items at the same versions', [{ itemID: 'item-a', version: 1 }], false],
  ['an item at a later version', [{ itemID: 'item-a', version: 2 }], true],
  ['another item in its place', [{ itemID: 'item-b', version: 1 }], true],
  [
    'an item added',
    [
      { itemID: 'item-a', version: 1 },
      { itemID: 'item-b', version: 1 },
    ],
    true,
  ],
  ['every item removed', [], true],
])('it answers %s as changed: %p', (_label, current, expected) => {
  expect(isCoreChanged([{ itemID: 'item-a', version: 1 }], current)).toBe(expected);
});
