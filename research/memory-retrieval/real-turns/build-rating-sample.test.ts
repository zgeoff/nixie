import { expect, test } from 'bun:test';
import { buildRatingSample } from './build-rating-sample.ts';

test('it gives each turn its pooled items and its shown past messages, under references the key maps back', () => {
  const sample = buildRatingSample(
    {
      chosen: [
        {
          caseID: 't4',
          stepSequence: 3,
          recalledSequence: 4,
          recordedAt: 0,
          query: 'and the ferry?',
          typedQuery: 'and the ferry?',
          shownMessages: [{ sequence: 2, text: 'the ferry leaves at nine', isCut: false }],
          isSessionStart: false,
          contextTokens: null,
          reply: 'Nine sharp.',
          earlier: [
            { owner: 'plan saturday', reply: 'Market first.' },
            { owner: 'and lunch?', reply: 'The pier cafe.' },
          ],
          candidates: [
            { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' },
            { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Dislikes boats' },
          ],
          logged: [],
          searchMode: 'hybrid',
          delivered: [],
          ratings: [],
        },
      ],
      strata: { short: 1, shown: 0, random: 0 },
    },
    new Map([['t4', ['item-a']]]),
  );

  expect(sample).toStrictEqual({
    turns: [
      {
        caseID: 't4',
        earlier: [{ owner: 'and lunch?', reply: 'The pier cafe.' }],
        message: 'and the ferry?',
        reply: 'Nine sharp.',
        items: [
          { ref: 'M1', text: 'Takes the ferry' },
          { ref: 'P1', text: 'the ferry leaves at nine' },
        ],
      },
    ],
    keys: [{ caseID: 't4', refs: { M1: 'item-a', P1: 'message:2' } }],
    strata: { short: 1, shown: 0, random: 0 },
  });
});
