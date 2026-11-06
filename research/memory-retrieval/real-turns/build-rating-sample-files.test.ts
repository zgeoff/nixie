import { expect, test } from 'bun:test';
import { buildRatingSampleFiles } from './build-rating-sample-files.ts';
import { sampleTurnSchema } from './build-sample.ts';
import { SHIPPED } from './rank-turn.ts';
import { sampleKeySchema } from './score-turns.ts';

test('it writes the sample, its key and one part per group of turns, with the pooled item under a key reference', () => {
  const turn = {
    caseID: 't4',
    stepSequence: 3,
    recalledSequence: 4,
    recordedAt: 0,
    query: 'and the ferry?',
    typedQuery: 'and the ferry?',
    shownMessages: [],
    isSessionStart: false,
    sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: 'Nine sharp.',
    earlier: [],
    candidates: [
      { itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' },
      { itemID: 'item-b', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Dislikes boats' },
    ],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };

  const built = buildRatingSampleFiles(
    {
      chosen: { chosen: [turn], strata: { short: 0, shown: 0, random: 1 } },
      runs: [{ name: 'served', encoder: 'leaf-ir-q8', kind: 'served', config: SHIPPED, isShipped: true }],
    },
    new Map([['served', [{ caseID: 't4', ranking: { facts: ['item-a'], selves: [] } }]]]),
    { topPlaces: 5, turnsPerPart: 15 },
  );
  const [sampleText, keyText] = built.files.slice(0, 2).map((file): unknown => JSON.parse(file.text.trim()));
  const sample = sampleTurnSchema.parse(sampleText);
  const key = sampleKeySchema.parse(keyText);

  expect({
    names: built.files.map((file) => file.name),
    items: sample.items.map((item) => item.text),
    key: Object.values(key.refs),
    summary: built.summary,
  }).toStrictEqual({
    names: ['sample.jsonl', 'sample-key.jsonl', 'part-01.md'],
    items: ['Takes the ferry'],
    key: ['item-a'],
    summary: { turns: 1, short: 0, shown: 0, random: 1, parts: 1, refs: 1, characters: expect.any(Number) },
  });
});
