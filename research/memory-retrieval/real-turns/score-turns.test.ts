import { expect, test } from 'bun:test';
import {
  buildPairedDifference,
  buildRuns,
  getShippedRun,
  labelSchema,
  sampleKeySchema,
  scoreRanking,
  scoreServed,
} from './score-turns.ts';

test('#scoreRanking gives recall at each depth and the reciprocal rank of the first needed item', () => {
  expect(
    scoreRanking(
      [{ caseID: 't1', ranking: { facts: ['noise-a', 'needed-a', 'noise-b', 'noise-c', 'needed-b'], selves: [] } }],
      new Map([
        [
          't1',
          {
            relevant: new Set(['needed-a', 'needed-b']),
            best: 'needed-b',
            noise: new Set<string>(),
            delivered: new Set<string>(),
            isLabelled: true,
          },
        ],
      ]),
    ),
  ).toStrictEqual({ cases: 1, recallAt3: 0.5, recallAt5: 1, recallAt10: 1, mrr: 0.5, bestAt5: 1 });
});

test('#scoreRanking counts a needed item at rank 11 toward the reciprocal rank', () => {
  expect(
    scoreRanking(
      [
        {
          caseID: 't1',
          ranking: { facts: [...Array.from({ length: 10 }, (_, position) => `noise-${position}`), 'needed-a'], selves: [] },
        },
      ],
      new Map([
        [
          't1',
          {
            relevant: new Set(['needed-a']),
            best: null,
            noise: new Set<string>(),
            delivered: new Set<string>(),
            isLabelled: true,
          },
        ],
      ]),
    ).mrr,
  ).toBe(0.091);
});

test('#scoreRanking leaves out the turns that need no item', () => {
  expect(
    scoreRanking(
      [{ caseID: 't1', ranking: { facts: ['noise-a'], selves: [] } }],
      new Map([
        [
          't1',
          { relevant: new Set<string>(), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
        ],
      ]),
    ),
  ).toStrictEqual({ cases: 0, recallAt3: 0, recallAt5: 0, recallAt10: 0, mrr: 0, bestAt5: 0 });
});

test('#scoreServed scores what a served set covers, brings fresh and shows on turns that need none', () => {
  expect(
    scoreServed(
      [
        { caseID: 't1', ranking: { facts: ['needed-b', 'noise-a'], selves: [] } },
        { caseID: 't2', ranking: { facts: ['noise-a'], selves: ['self-a'] } },
      ],
      new Map([
        [
          't1',
          {
            relevant: new Set(['needed-a', 'needed-b', 'needed-c']),
            best: null,
            noise: new Set(['noise-a']),
            delivered: new Set(['needed-a']),
            isLabelled: true,
          },
        ],
        [
          't2',
          { relevant: new Set<string>(), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
        ],
      ]),
    ),
  ).toStrictEqual({
    goldCases: 1,
    coveredRecall: 0.667,
    freshCases: 1,
    freshRecall: 0.5,
    emptyCases: 1,
    shownOnEmpty: 2,
    emptyWithAny: 1,
    precision: 0.25,
    noiseServed: 1,
  });
});

test('#buildPairedDifference gives no difference for a run against itself', () => {
  const ranked = [
    { caseID: 't1', ranking: { facts: ['needed-a'], selves: [] } },
    { caseID: 't2', ranking: { facts: ['noise-a', 'needed-b'], selves: [] } },
  ];

  expect(
    buildPairedDifference(
      ranked,
      ranked,
      new Map([
        [
          't1',
          { relevant: new Set(['needed-a']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
        ],
        [
          't2',
          { relevant: new Set(['needed-b']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
        ],
      ]),
      'reciprocal',
    ),
  ).toStrictEqual({ mean: 0, low: 0, high: 0 });
});

test('#buildPairedDifference gives the same gain at every bound when a run gains the same on every turn', () => {
  expect(
    buildPairedDifference(
      [
        { caseID: 't1', ranking: { facts: ['needed-a'], selves: [] } },
        { caseID: 't2', ranking: { facts: ['needed-b'], selves: [] } },
      ],
      [
        { caseID: 't1', ranking: { facts: ['noise-a', 'needed-a'], selves: [] } },
        { caseID: 't2', ranking: { facts: ['noise-a', 'needed-b'], selves: [] } },
      ],
      new Map([
        [
          't1',
          { relevant: new Set(['needed-a']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
        ],
        [
          't2',
          { relevant: new Set(['needed-b']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true },
        ],
      ]),
      'reciprocal',
    ),
  ).toStrictEqual({ mean: 0.5, low: 0.5, high: 0.5 });
});

test('#buildPairedDifference gives the same interval on every call', () => {
  const run = [
    { caseID: 't1', ranking: { facts: ['needed-a'], selves: [] } },
    { caseID: 't2', ranking: { facts: ['noise-a', 'needed-b'], selves: [] } },
    { caseID: 't3', ranking: { facts: ['noise-a'], selves: [] } },
  ];
  const base = [
    { caseID: 't1', ranking: { facts: ['noise-a', 'needed-a'], selves: [] } },
    { caseID: 't2', ranking: { facts: ['needed-b'], selves: [] } },
    { caseID: 't3', ranking: { facts: ['needed-c'], selves: [] } },
  ];
  const gold = new Map([
    ['t1', { relevant: new Set(['needed-a']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true }],
    ['t2', { relevant: new Set(['needed-b']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true }],
    ['t3', { relevant: new Set(['needed-c']), best: null, noise: new Set<string>(), delivered: new Set<string>(), isLabelled: true }],
  ]);

  expect(buildPairedDifference(run, base, gold, 'at5')).toStrictEqual(buildPairedDifference(run, base, gold, 'at5'));
});

test('#getShippedRun compares rankings against the shipped encoder when another comes first', () => {
  expect(getShippedRun(buildRuns(['bge-small', 'leaf-ir-q8']), 'ranking').name).toBe('leaf-ir-q8 hybrid');
});

test('#getShippedRun compares served sets against the shipped floors', () => {
  expect(getShippedRun(buildRuns(['leaf-ir-q8']), 'served').name).toBe('leaf-ir-q8 served, similarity 0.38, BM25 0.25');
});

test('#buildRuns runs the shipped encoder when the list leaves it out', () => {
  expect(getShippedRun(buildRuns(['minilm']), 'ranking').encoder).toBe('leaf-ir-q8');
});

test('#labelSchema accepts a label with its needed references and best one', () => {
  expect(labelSchema.safeParse({ caseID: 't4', relevant: ['M1', 'M3'], best: 'M3' }).data).toStrictEqual({
    caseID: 't4',
    relevant: ['M1', 'M3'],
    best: 'M3',
  });
});

test('#labelSchema rejects a label whose needed references are one string', () => {
  expect(labelSchema.safeParse({ caseID: 't4', relevant: 'M1', best: 'M1' }).error?.issues).toContainEqual(
    expect.objectContaining({ path: ['relevant'] }),
  );
});

test('#sampleKeySchema accepts a key that maps each reference to an item', () => {
  expect(sampleKeySchema.safeParse({ caseID: 't4', refs: { M1: 'item-a' } }).data).toStrictEqual({
    caseID: 't4',
    refs: { M1: 'item-a' },
  });
});

test('#sampleKeySchema rejects a key whose reference maps to a number', () => {
  expect(sampleKeySchema.safeParse({ caseID: 't4', refs: { M1: 7 } }).error?.issues).toContainEqual(
    expect.objectContaining({ path: ['refs', 'M1'] }),
  );
});
