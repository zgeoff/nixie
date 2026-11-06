import { expect, test } from 'bun:test';
import { buildBlockSummary } from './build-block-summary.ts';

test('it gives the nearest-rank 90th percentile of a block over the turns that have it', () => {
  const turn = {
    caseID: 't1',
    stepSequence: 1,
    recalledSequence: 2,
    recordedAt: 0,
    query: 'what is on today',
    typedQuery: 'what is on today',
    shownMessages: [],
    isSessionStart: false,
    sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: '',
    earlier: [],
    candidates: [],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };

  const summary = buildBlockSummary(
    [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((items) => ({ turn, tokens: { pinned: 0, pinnedChanges: 0, items, selfNotes: 0, messages: 0 }, sessionHeld: items })),
  );

  expect(summary.blocks['items']).toStrictEqual({ perTurn: 55, turnsWithIt: 10, whenPresent: 55, p90WhenPresent: 90 });
});

test('it gives the median, mean and largest count a session held', () => {
  const turn = {
    caseID: 't1',
    stepSequence: 1,
    recalledSequence: 2,
    recordedAt: 0,
    query: 'what is on today',
    typedQuery: 'what is on today',
    shownMessages: [],
    isSessionStart: false,
    sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: '',
    earlier: [],
    candidates: [],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };

  const summary = buildBlockSummary(
    [400, 100, 300, 200].map((sessionHeld) => ({ turn, tokens: { pinned: 0, pinnedChanges: 0, items: 0, selfNotes: 0, messages: 0 }, sessionHeld })),
  );

  expect(summary.sessionHeld).toStrictEqual({ mean: 250, median: 200, max: 400 });
});

test('it counts the turns that showed past messages and averages the logged call context', () => {
  const turn = (contextTokens: number | null, shownMessages: { sequence: number; text: string; isCut: boolean; thread: string; recordedAt: number }[]) => ({
    caseID: 't1',
    stepSequence: 1,
    recalledSequence: 2,
    recordedAt: 0,
    query: 'what is on today',
    typedQuery: 'what is on today',
    shownMessages,
    isSessionStart: false,
    sessionNumber: 0,
    isShredded: false,
    contextTokens,
    reply: '',
    earlier: [],
    candidates: [],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  });
  const tokens = { pinned: 0, pinnedChanges: 0, items: 0, selfNotes: 0, messages: 0 };

  const summary = buildBlockSummary([
    { turn: turn(1000, [{ sequence: 1, text: 'the train was late', isCut: false, thread: 'conversation', recordedAt: 0 }]), tokens, sessionHeld: 0 },
    { turn: turn(3000, []), tokens, sessionHeld: 0 },
    { turn: turn(null, []), tokens, sessionHeld: 0 },
  ]);

  expect({ turns: summary.turns, meanCallContext: summary.meanCallContext, turnsWithShownMessages: summary.turnsWithShownMessages }).toStrictEqual({
    turns: 3,
    meanCallContext: 2000,
    turnsWithShownMessages: 1,
  });
});
