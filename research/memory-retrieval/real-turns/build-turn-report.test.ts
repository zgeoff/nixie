import { expect, test } from 'bun:test';
import { buildTurnReport } from './build-turn-report.ts';
import { SHIPPED } from './rank-turn.ts';

test('it counts the scored, labelled and short turns, and scores the blocks of short turns apart', () => {
  const turn = (caseID: string, query: string) => ({
    caseID,
    stepSequence: 3,
    recalledSequence: 4,
    recordedAt: 0,
    query,
    typedQuery: query,
    shownMessages: [],
    isSessionStart: false, sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: 'Noted.',
    earlier: [],
    candidates: [{ itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' }],
    logged: [{ itemID: 'item-a', version: 1 }],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  });
  const expected = {
    relevant: new Set(['item-a']),
    messages: new Set<string>(),
    best: 'item-a',
    noise: new Set<string>(),
    misleading: new Set<string>(),
    delivered: new Set<string>(),
    isLabelled: true,
  };
  const ranked = [
    { caseID: 't4', ranking: { facts: ['item-a'], selves: [] } },
    { caseID: 't9', ranking: { facts: ['item-a'], selves: [] } },
  ];

  const built = buildTurnReport({
    chosen: [turn('t4', 'ferry?'), turn('t9', 'when does the morning ferry leave the island')],
    hybrid: [],
    records: [],
    gold: new Map([
      ['t4', expected],
      ['t9', expected],
    ]),
    labelled: 2,
    runs: [
      { name: 'ranking', encoder: 'leaf-ir-q8', kind: 'ranking', config: SHIPPED, isShipped: true },
      { name: 'served', encoder: 'leaf-ir-q8', kind: 'served', config: SHIPPED, isShipped: true },
    ],
    results: new Map([
      ['ranking', ranked],
      ['served', ranked],
    ]),
    pooledByCase: new Map(),
    ratedMessages: [],
    excludedWords: [],
    shortWords: 3,
    heldOutSeed: 4716,
  });

  expect({
    firstLine: built.lines[0],
    turns: built.report['turns'],
    labelled: built.report['labelled'],
    blocks: built.report['blocks'],
  }).toStrictEqual({
    firstLine: 'turns 2, labelled 2, short 1\n',
    turns: 2,
    labelled: 2,
    blocks: expect.objectContaining({
      short: expect.objectContaining({ turns: 1 }),
      other: expect.objectContaining({ turns: 1 }),
    }),
  });
});
