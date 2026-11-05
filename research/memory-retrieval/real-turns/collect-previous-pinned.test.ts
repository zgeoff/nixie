import { expect, test } from 'bun:test';
import { collectPreviousPinned } from './collect-previous-pinned.ts';

test('it gives each turn the pinned core of the turn before it in the same session', () => {
  const pinned = { itemID: 'item-a', version: 2, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by the canal' };
  const unpinned = { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a narrowboat' };

  expect(
    collectPreviousPinned([
      { sessionNumber: 1, candidates: [pinned, unpinned] },
      { sessionNumber: 1, candidates: [unpinned] },
      { sessionNumber: 2, candidates: [pinned] },
    ]),
  ).toStrictEqual([null, [{ itemID: 'item-a', version: 2 }], null]);
});
