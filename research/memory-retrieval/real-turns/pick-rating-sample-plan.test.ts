import { expect, test } from 'bun:test';
import { pickRatingSamplePlan } from './pick-rating-sample-plan.ts';
import { buildRuns } from './score-turns.ts';

test('it picks the hybrid turns that were sent and pools only the shipped ranking with every served setting', () => {
  const turn = {
    caseID: 't4',
    stepSequence: 3,
    recalledSequence: 4,
    recordedAt: 0,
    query: 'and the ferry times for saturday?',
    typedQuery: 'and the ferry times for saturday?',
    shownMessages: [],
    isSessionStart: false,
    sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: 'Nine sharp.',
    earlier: [],
    candidates: [{ itemID: 'item-a', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the ferry' }],
    logged: [],
    searchMode: 'hybrid',
    delivered: [],
    ratings: [],
  };

  const plan = pickRatingSamplePlan([turn, { ...turn, caseID: 't9', recalledSequence: 9, isShredded: true }], 10, 3, buildRuns(['leaf-ir-q8']));

  expect({
    chosen: plan.chosen.chosen.map((chosen) => chosen.caseID),
    rankingRuns: plan.runs.filter((run) => run.kind === 'ranking').map((run) => run.isShipped),
    hasServed: plan.runs.some((run) => run.kind === 'served'),
  }).toStrictEqual({ chosen: ['t4'], rankingRuns: [true], hasServed: true });
});
