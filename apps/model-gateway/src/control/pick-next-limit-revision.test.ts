import { expect, test } from 'bun:test';
import { buildFreshStore } from '../periods/build-fresh-store';
import { pickNextLimitRevision } from './pick-next-limit-revision';

test.each([
  ['an empty store', {}, 1],
  ['a store that removed a sandbox at revision 5', { lastLimitRevision: 5 }, 6],
  [
    'a store at revision 5 that holds the name at revision 2',
    {
      lastLimitRevision: 5,
      sandboxes: {
        alpha: { micros: 0, tokens: 0, limit: null, lastRefusal: null, limitRevision: 2 },
      },
    },
    6,
  ],
  [
    'a store with no mark that holds the name at revision 3',
    {
      sandboxes: {
        alpha: { micros: 0, tokens: 0, limit: null, lastRefusal: null, limitRevision: 3 },
      },
    },
    4,
  ],
] as const)('it picks the next revision of %s as %p', (_, parts, expected) => {
  const store = { ...buildFreshStore(0, 'UTC', []), ...parts };

  expect(pickNextLimitRevision(store, 'alpha')).toBe(expected);
});
