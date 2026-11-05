import { expect, test } from 'bun:test';
import { countMissedItems } from './count-missed-items.ts';

test('it sorts each left-out item by why the list lacked it', () => {
  const missed = countMissedItems(
    [
      {
        caseID: 't9',
        stepSequence: 8,
        recalledSequence: 9,
        recordedAt: 0,
        query: 'what about the boat?',
        typedQuery: 'what about the boat?',
        shownMessages: [],
        isSessionStart: false,
        isShredded: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-held', version: 2, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a boat' },
          { itemID: 'item-pin', version: 1, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Lives by a lake' },
          { itemID: 'item-secret', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: true, text: 'Sails at night' },
          { itemID: 'item-old', version: 1, isSelf: false, isPinned: false, isLapsed: true, isSensitive: false, text: 'Rowed once' },
          { itemID: 'item-list', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Boat is blue' },
          { itemID: 'item-low', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Boat needs paint' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: ['item-held@2'],
        ratings: [],
      },
    ],
    [
      {
        caseID: 't9',
        itemIDs: ['item-held', 'item-pin', 'item-secret', 'item-old', 'item-list', 'item-low', 'item-later'],
        unmatched: 1,
      },
    ],
    new Map([['t9', new Set(['item-list'])]]),
  );

  expect(missed).toStrictEqual({
    turnsWithMiss: 1,
    turnsWithMissOutsideList: 1,
    unmatched: 1,
    byReason: { held: 1, pinned: 1, sensitive: 1, lapsed: 1, pooled: 1, eligible: 1, absent: 1 },
    turnsWithSensitiveMiss: 1,
  });
});

test('it counts no miss outside the list when every left-out item sat in it', () => {
  const missed = countMissedItems(
    [
      {
        caseID: 't9',
        stepSequence: 8,
        recalledSequence: 9,
        recordedAt: 0,
        query: 'what about the boat?',
        typedQuery: 'what about the boat?',
        shownMessages: [],
        isSessionStart: false,
        isShredded: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-list', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Boat is blue' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't9', itemIDs: ['item-list'], unmatched: 0 }],
    new Map([['t9', new Set(['item-list'])]]),
  );

  expect(missed.turnsWithMissOutsideList).toBe(0);
});
