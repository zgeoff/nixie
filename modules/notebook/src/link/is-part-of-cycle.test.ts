import { expect, test } from 'bun:test';
import { isPartOfCycle } from './is-part-of-cycle';

test.each([
  ['a direct loop', [{ from: 'b', to: 'a' }], { from: 'a', to: 'b' }, true],
  [
    'a loop through 2 notes',
    [
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ],
    { from: 'a', to: 'b' },
    true,
  ],
  ['no loop', [{ from: 'b', to: 'c' }], { from: 'a', to: 'b' }, false],
  ['a second parent', [{ from: 'a', to: 'c' }], { from: 'a', to: 'b' }, false],
  ['an empty set', [], { from: 'a', to: 'b' }, false],
] as const)('it answers %s: %s', (_title, edges, added, expected) => {
  expect(isPartOfCycle(edges, added)).toBe(expected);
});
