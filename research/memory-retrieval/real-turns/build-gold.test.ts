import { expect, test } from 'bun:test';
import { buildGold } from './build-gold.ts';

test('it maps the label references to items and counts a delivered item only at its current version', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 2, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Packs light' },
          { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Flies on Friday' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: ['item-a@1', 'item-b@1'],
        ratings: [{ itemID: 'item-b', verdict: 'noise', note: null }],
      },
    ],
    [{ caseID: 't7', relevant: ['M2', 'M1'], best: 'M1' }],
    [{ caseID: 't7', refs: { M1: 'item-a', M2: 'item-b' } }],
  );

  expect(built).toStrictEqual({
    gold: new Map([
      [
        't7',
        {
          relevant: new Set(['item-b', 'item-a']),
          best: 'item-a',
          messages: new Set<string>(),
          noise: new Set(['item-b']),
          misleading: new Set<string>(),
          delivered: new Set(['item-b']),
          isLabelled: true,
        },
      ],
    ]),
  });
});

test('it keeps a named past message apart from the needed items', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [{ sequence: 3, text: 'pack the blue coat', isCut: false }],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Packs light' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't7', relevant: ['P1'], best: 'P1' }],
    [{ caseID: 't7', refs: { M1: 'item-a', P1: 'message:3' } }],
  );

  expect('gold' in built ? built.gold.get('t7') : null).toStrictEqual({
    relevant: new Set<string>(),
    messages: new Set(['message:3']),
    best: 'message:3',
    noise: new Set<string>(),
    misleading: new Set<string>(),
    delivered: new Set<string>(),
    isLabelled: true,
  });
});

test('it returns each label reference the key lacks', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't7', relevant: ['M1', 'M4'], best: 'M5' }],
    [{ caseID: 't7', refs: { M1: 'item-a' } }],
  );

  expect(built).toStrictEqual({ unknownRefs: ['t7/M4', 't7/M5'], absentCases: [] });
});

test('it returns each labelled case the rebuilt turns lack', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [
      { caseID: 't7', relevant: [], best: null },
      { caseID: 't70', relevant: [], best: null },
    ],
    [{ caseID: 't7', refs: {} }],
  );

  expect(built).toStrictEqual({ unknownRefs: [], absentCases: ['t70'] });
});

test('it maps the references the rater called misleading to items', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't7', relevant: [], best: null, misleading: ['M2'] }],
    [{ caseID: 't7', refs: { M1: 'item-a', M2: 'item-b' } }],
  );

  expect('gold' in built ? built.gold.get('t7')?.misleading : null).toStrictEqual(new Set(['item-b']));
});

test('it adds the items the list left out to the needed items, and counts a pinned one as delivered', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-c', version: 1, isSelf: false, isPinned: true, isLapsed: false, isSensitive: false, text: 'Hates the cold' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't7', relevant: ['M1'], best: 'M1', missing: ['the cold', 'the trip'] }],
    [{ caseID: 't7', refs: { M1: 'item-a' } }],
    { missing: [{ caseID: 't7', itemIDs: ['item-c', 'item-d'], unmatched: 0 }], heldCases: new Set(), heldItems: new Map() },
  );

  expect('gold' in built ? built.gold.get('t7') : null).toStrictEqual({
    relevant: new Set(['item-a', 'item-c', 'item-d']),
    messages: new Set<string>(),
    best: 'item-a',
    noise: new Set<string>(),
    misleading: new Set<string>(),
    delivered: new Set(['item-c']),
    isLabelled: true,
  });
});

test('it counts every listed item of a held case as delivered', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't7', relevant: [], best: null }],
    [{ caseID: 't7', refs: { M1: 'item-a', M2: 'item-b', P1: 'message:3' } }],
    { missing: [], heldCases: new Set(['t7']), heldItems: new Map() },
  );

  expect('gold' in built ? built.gold.get('t7')?.delivered : null).toStrictEqual(new Set(['item-a', 'item-b']));
});

test('it counts an item the exchange itself added as delivered', () => {
  const built = buildGold(
    [
      {
        caseID: 't7',
        stepSequence: 5,
        recalledSequence: 7,
        recordedAt: 0,
        query: 'what should I pack?',
        typedQuery: 'what should I pack?',
        shownMessages: [],
        isSessionStart: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't7', relevant: [], best: null }],
    [{ caseID: 't7', refs: { M1: 'item-a', M2: 'item-b' } }],
    { missing: [], heldCases: new Set(), heldItems: new Map([['t7', new Set(['item-b'])]]) },
  );

  expect('gold' in built ? built.gold.get('t7')?.delivered : null).toStrictEqual(new Set(['item-b']));
});
