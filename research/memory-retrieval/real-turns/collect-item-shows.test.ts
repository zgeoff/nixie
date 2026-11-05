import { expect, test } from 'bun:test';
import { collectItemShows } from './collect-item-shows.ts';

test('it counts how often each item was retrieved against how the rater judged it', () => {
  const turn = {
    stepSequence: 1,
    recalledSequence: 2,
    recordedAt: 0,
    query: 'any plans?',
    typedQuery: 'any plans?',
    shownMessages: [],
    isSessionStart: false,
    isShredded: false,
    contextTokens: null,
    reply: '',
    earlier: [],
    candidates: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };

  const report = collectItemShows(
    [
      { ...turn, caseID: 't1', logged: [{ itemID: 'item-hub', version: 1 }] },
      {
        ...turn,
        caseID: 't2',
        logged: [
          { itemID: 'item-hub', version: 1 },
          { itemID: 'item-plan', version: 1 },
        ],
      },
      { ...turn, caseID: 't3', logged: [{ itemID: 'item-hub', version: 1 }] },
    ],
    new Map([
      [
        't2',
        {
          relevant: new Set(['item-plan']),
          messages: new Set<string>(),
          best: 'item-plan',
          noise: new Set<string>(),
          misleading: new Set(['item-hub']),
          delivered: new Set<string>(),
          isLabelled: true,
        },
      ],
      [
        't3',
        {
          relevant: new Set<string>(),
          messages: new Set<string>(),
          best: null,
          noise: new Set<string>(),
          misleading: new Set<string>(),
          delivered: new Set(['item-hub']),
          isLabelled: true,
        },
      ],
    ]),
    new Map([
      ['t2', new Set(['item-hub', 'item-plan'])],
      ['t3', new Set(['item-hub'])],
    ]),
    [1],
  );

  expect(report).toStrictEqual({
    items: [
      { itemID: 'item-hub', retrieved: 3, pooled: 2, helpful: 0, misleading: 1, held: 1 },
      { itemID: 'item-plan', retrieved: 1, pooled: 1, helpful: 1, misleading: 0, held: 0 },
    ],
    shownEntries: 4,
    topShares: [{ top: 1, share: 0.75 }],
  });
});
