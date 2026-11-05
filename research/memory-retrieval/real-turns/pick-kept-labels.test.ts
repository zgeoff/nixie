import { expect, test } from 'bun:test';
import { pickKeptLabels } from './pick-kept-labels.ts';

test('it drops the labels on an excluded turn, a turn about retrieval and a shredded turn', () => {
  const turns = [
    { caseID: 't10', query: 'is it cold out?', reply: 'Very.', isShredded: false },
    { caseID: 't20', query: 'is the ferry on time?', reply: 'Yes.', isShredded: false },
    { caseID: 't30', query: 'why did the retriever pick that?', reply: 'No idea.', isShredded: false },
    { caseID: 't40', query: 'book a table', reply: '', isShredded: true },
  ].map((turn) => ({
    ...turn,
    stepSequence: 0,
    recalledSequence: 0,
    recordedAt: 0,
    typedQuery: turn.query,
    shownMessages: [],
    isSessionStart: false,
    contextTokens: null,
    earlier: [],
    candidates: [],
    logged: [],
    searchMode: 'hybrid' as const,
    delivered: [],
    ratings: [],
  }));

  const picked = pickKeptLabels(
    turns.map((turn) => ({ caseID: turn.caseID, relevant: [], best: null })),
    turns,
    [{ from: 20, to: 20 }],
  );

  expect({ ...picked, kept: picked.kept.map((label) => label.caseID) }).toStrictEqual({
    kept: ['t10'],
    inRange: 1,
    flagged: 1,
    both: 0,
    shredded: 1,
  });
});
