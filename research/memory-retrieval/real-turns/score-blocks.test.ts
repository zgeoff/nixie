import { expect, test } from 'bun:test';
import { scoreBlocks } from './score-blocks.ts';

test('it scores the items, self notes and past messages a labelled turn was shown against what the rater named', () => {
  const score = scoreBlocks(
    [
      {
        caseID: 't4',
        stepSequence: 3,
        recalledSequence: 4,
        recordedAt: 0,
        query: 'and the ferry?',
        typedQuery: 'and the ferry?',
        shownMessages: [
          { sequence: 2, text: 'the ferry leaves at nine', isCut: false },
          { sequence: 3, text: 'lovely', isCut: false },
        ],
        isSessionStart: false,
        isShredded: false,
        contextTokens: null,
        reply: 'Nine sharp.',
        earlier: [],
        candidates: [
          { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' },
          { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Dislikes boats' },
          { itemID: 'item-c', version: 1, isSelf: true, isPinned: false, isLapsed: false, isSensitive: false, text: 'Keeps replies short' },
        ],
        logged: [
          { itemID: 'item-a', version: 1 },
          { itemID: 'item-b', version: 1 },
          { itemID: 'item-c', version: 1 },
        ],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    new Map([
      [
        't4',
        {
          relevant: new Set(['item-a']),
          messages: new Set(['message:2']),
          best: 'item-a',
          noise: new Set<string>(),
          misleading: new Set(['item-b', 'message:3']),
          delivered: new Set<string>(),
          isLabelled: true,
        },
      ],
    ]),
  );

  expect(score).toStrictEqual({
    turns: 1,
    items: { turnsShown: 1, shown: 2, helpful: 1, misleading: 1, precision: 0.5, turnsWithHelpful: 1 },
    selfNotes: { turnsShown: 1, shown: 1, helpful: 0, misleading: 0, precision: 0, turnsWithHelpful: 0 },
    messages: { turnsShown: 1, shown: 2, helpful: 1, misleading: 1, precision: 0.5, turnsWithHelpful: 1 },
  });
});

test('it leaves out a turn with no label', () => {
  expect(
    scoreBlocks(
      [
        {
          caseID: 't4',
          stepSequence: 3,
          recalledSequence: 4,
          recordedAt: 0,
          query: 'ok',
          typedQuery: 'ok',
          shownMessages: [{ sequence: 2, text: 'lovely', isCut: false }],
          isSessionStart: false,
          isShredded: false,
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
      new Map(),
    ).messages.shown,
  ).toBe(0);
});
