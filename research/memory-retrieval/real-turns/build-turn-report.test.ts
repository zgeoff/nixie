import { expect, test } from 'bun:test';
import { buildTurnReport } from './build-turn-report.ts';
import { SHIPPED } from './rank-turn.ts';

test('it scores the short turns, the technical turns and the chat turns each on its own turns', () => {
  const turn = (caseID: string, query: string) => ({
    caseID,
    stepSequence: 3,
    recalledSequence: 4,
    recordedAt: 0,
    query,
    typedQuery: query,
    shownMessages: [],
    isSessionStart: false,
    sessionNumber: 0,
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
  const ranked = [
    { caseID: 't4', ranking: { facts: ['item-a'], selves: [] } },
    { caseID: 't9', ranking: { facts: ['item-a'], selves: [] } },
  ];

  const built = buildTurnReport({
    chosen: [turn('t4', 'ferry?'), turn('t9', 'fix the deploy config for the ferry app')],
    hybrid: [],
    records: [],
    gold: new Map([
      [
        't4',
        {
          relevant: new Set(['item-a']),
          messages: new Set<string>(),
          best: 'item-a',
          noise: new Set<string>(),
          misleading: new Set<string>(),
          delivered: new Set<string>(),
          isLabelled: true,
        },
      ],
      [
        't9',
        {
          relevant: new Set<string>(),
          messages: new Set<string>(),
          best: null,
          noise: new Set<string>(),
          misleading: new Set<string>(),
          delivered: new Set<string>(),
          isLabelled: true,
        },
      ],
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

  expect({ short: built.report['short'], kinds: built.report['kinds'] }).toStrictEqual({
    short: expect.objectContaining({ served: expect.objectContaining({ freshCases: 1, emptyCases: 0 }) }),
    kinds: expect.objectContaining({
      technical: expect.objectContaining({ served: expect.objectContaining({ freshCases: 0, emptyCases: 1, shownOnEmpty: 1 }) }),
      chat: expect.objectContaining({ served: expect.objectContaining({ freshCases: 1, emptyCases: 0 }) }),
    }),
  });
});

test('it scores the selection half and the held-out half each on its own turns', () => {
  const turn = (caseID: string) => ({
    caseID,
    stepSequence: 3,
    recalledSequence: 4,
    recordedAt: 0,
    query: 'when does the morning ferry leave the island',
    typedQuery: 'when does the morning ferry leave the island',
    shownMessages: [],
    isSessionStart: false,
    sessionNumber: 0,
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
  const ranked = [
    { caseID: 't4', ranking: { facts: ['item-a'], selves: [] } },
    { caseID: 't9', ranking: { facts: ['item-a'], selves: [] } },
  ];

  const built = buildTurnReport({
    chosen: [turn('t4'), turn('t9')],
    hybrid: [],
    records: [],
    gold: new Map([
      [
        't4',
        {
          relevant: new Set(['item-a']),
          messages: new Set<string>(),
          best: 'item-a',
          noise: new Set<string>(),
          misleading: new Set<string>(),
          delivered: new Set<string>(),
          isLabelled: true,
        },
      ],
      [
        't9',
        {
          relevant: new Set<string>(),
          messages: new Set<string>(),
          best: null,
          noise: new Set<string>(),
          misleading: new Set<string>(),
          delivered: new Set<string>(),
          isLabelled: true,
        },
      ],
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

  expect({ selection: built.report['selection'], heldOut: built.report['heldOut'] }).toStrictEqual({
    selection: expect.objectContaining({
      served: expect.objectContaining({ freshCases: 1, freshRecall: 1, emptyCases: 0, shownOnEmpty: 0 }),
    }),
    heldOut: expect.objectContaining({
      served: expect.objectContaining({ freshCases: 0, emptyCases: 1, shownOnEmpty: 1 }),
    }),
  });
});

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
