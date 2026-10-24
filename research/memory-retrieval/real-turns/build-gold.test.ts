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
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 2, isSelf: false, isPinned: false, isLapsed: false, text: 'Packs light' },
          { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, text: 'Flies on Friday' },
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
          noise: new Set(['item-b']),
          delivered: new Set(['item-b']),
          isLabelled: true,
        },
      ],
    ]),
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
