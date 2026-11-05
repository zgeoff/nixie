import { expect, test } from 'bun:test';
import { collectExchangeItems } from './collect-exchange-items.ts';

test('it collects the items whose version was added since the turn before', () => {
  const turn = {
    stepSequence: 0,
    recordedAt: 0,
    query: 'saved it?',
    typedQuery: 'saved it?',
    shownMessages: [],
    isSessionStart: false, sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: '',
    earlier: [],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };
  const candidate = { isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Likes tea' };
  const version = { change: 'create', state: 'active', until: null, status: 'readable' };

  const items = collectExchangeItems(
    [
      { ...turn, caseID: 't20', recalledSequence: 20, candidates: [{ ...candidate, itemID: 'item-old', version: 1 }] },
      {
        ...turn,
        caseID: 't30',
        recalledSequence: 30,
        candidates: [
          { ...candidate, itemID: 'item-old', version: 1 },
          { ...candidate, itemID: 'item-new', version: 2 },
        ],
      },
    ],
    [
      { ...version, item_id: 'item-old', version: 1, sequence: 5 },
      { ...version, item_id: 'item-new', version: 1, sequence: 6 },
      { ...version, item_id: 'item-new', version: 2, sequence: 25 },
    ],
  );

  expect(items).toStrictEqual(new Map([['t30', new Set(['item-new'])]]));
});

test.each([
  [20, false],
  [21, true],
  [29, true],
  [30, false],
])('it answers %p with %p for a version between retrievals at 20 and 30', (sequence, isCollected) => {
  const turn = {
    stepSequence: 0,
    recordedAt: 0,
    query: 'saved it?',
    typedQuery: 'saved it?',
    shownMessages: [],
    isSessionStart: false, sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: '',
    earlier: [],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };
  const candidate = { itemID: 'item-new', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Likes tea' };

  const items = collectExchangeItems(
    [
      { ...turn, caseID: 't20', recalledSequence: 20, candidates: [] },
      { ...turn, caseID: 't30', recalledSequence: 30, candidates: [candidate] },
    ],
    [{ change: 'create', state: 'active', until: null, status: 'readable', item_id: 'item-new', version: 1, sequence }],
  );

  expect(items.has('t30')).toBe(isCollected);
});
