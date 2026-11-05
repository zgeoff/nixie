import { expect, test } from 'bun:test';
import { collectWritingTurns } from './collect-writing-turns.ts';

test('it collects the turns whose exchange proposed a memory', () => {
  const turn = {
    stepSequence: 0,
    recordedAt: 0,
    query: 'remember that',
    typedQuery: 'remember that',
    shownMessages: [],
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
  };
  const record = { recordedAt: '', thread: 'conversation', parent: null, payload: {}, erasable: { status: 'none' as const } };

  const writing = collectWritingTurns(
    [
      { ...turn, caseID: 't10', recalledSequence: 10 },
      { ...turn, caseID: 't20', recalledSequence: 20 },
      { ...turn, caseID: 't30', recalledSequence: 30 },
    ],
    [
      { ...record, sequence: 12, kind: 'memory.proposed' },
      { ...record, sequence: 25, kind: 'memory.recalled' },
      { ...record, sequence: 31, kind: 'memory.proposal_self_noted' },
    ],
  );

  expect(writing).toStrictEqual(new Set(['t10', 't30']));
});
