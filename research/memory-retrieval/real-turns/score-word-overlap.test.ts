import { expect, test } from 'bun:test';
import { scoreWordOverlap } from './score-word-overlap.ts';

test('it gives recall apart for needed items that share a content word with the message and those that share none', () => {
  const score = scoreWordOverlap(
    [
      {
        caseID: 't5',
        stepSequence: 4,
        recalledSequence: 5,
        recordedAt: 0,
        query: 'Dana and the garden this weekend',
        typedQuery: 'Dana and the garden this weekend',
        shownMessages: [],
        isSessionStart: false, sessionNumber: 0,
        isShredded: false,
        contextTokens: null,
        reply: '',
        earlier: [],
        candidates: [
          { itemID: 'item-garden', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'The garden has raised beds' },
          { itemID: 'item-name', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Dana likes tea' },
          { itemID: 'item-rest', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Rests on Sundays' },
          { itemID: 'item-held', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Weekend plans are fixed' },
        ],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    new Map([
      [
        't5',
        {
          relevant: new Set(['item-garden', 'item-name', 'item-rest', 'item-held']),
          messages: new Set<string>(),
          best: null,
          noise: new Set<string>(),
          misleading: new Set<string>(),
          delivered: new Set(['item-held']),
          pinned: new Set<string>(),
          isLabelled: true,
        },
      ],
    ]),
    new Map([['t5', ['item-garden', 'item-name']]]),
    ['Dana'],
  );

  expect(score).toStrictEqual({
    shared: { needed: 1, reached: 1, recall: 1 },
    none: { needed: 2, reached: 1, recall: 0.5 },
  });
});
