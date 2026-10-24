import { expect, test } from 'bun:test';
import { pickScoredTurns } from './pick-scored-turns.ts';

test('it scores only the labelled turns when labels exist', () => {
  const picked = pickScoredTurns(
    [
      {
        caseID: 't3',
        stepSequence: 1,
        recalledSequence: 3,
        recordedAt: 0,
        query: 'any plans?',
        reply: '',
        earlier: [],
        candidates: [],
        logged: [{ itemID: 'item-a', version: 1 }],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
      {
        caseID: 't9',
        stepSequence: 7,
        recalledSequence: 9,
        recordedAt: 0,
        query: 'and tomorrow?',
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [{ caseID: 't9', relevant: [], best: null }],
  );

  expect(picked.map((turn) => turn.caseID)).toStrictEqual(['t9']);
});

test('it scores the turns that retrieved or were rated when no labels exist', () => {
  const picked = pickScoredTurns(
    [
      {
        caseID: 't3',
        stepSequence: 1,
        recalledSequence: 3,
        recordedAt: 0,
        query: 'any plans?',
        reply: '',
        earlier: [],
        candidates: [],
        logged: [{ itemID: 'item-a', version: 1 }],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
      {
        caseID: 't6',
        stepSequence: 4,
        recalledSequence: 6,
        recordedAt: 0,
        query: 'and after?',
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [{ itemID: 'item-a', verdict: 'noise', note: null }],
      },
      {
        caseID: 't9',
        stepSequence: 7,
        recalledSequence: 9,
        recordedAt: 0,
        query: 'and tomorrow?',
        reply: '',
        earlier: [],
        candidates: [],
        logged: [],
        searchMode: 'hybrid',
        delivered: [],
        ratings: [],
      },
    ],
    [],
  );

  expect(picked.map((turn) => turn.caseID)).toStrictEqual(['t3', 't6']);
});
