import { expect, test } from 'bun:test';
import { planTaskTurnEnd } from './plan-task-turn-end';

test('it pauses a turn whose calls reached the budget at the counts before it plus its own, counts its spend in the pause, and sleeps the imp', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: true,
      spentDollars: 0.25,
      endedTurns: 1,
      isPauseRequested: false,
      next: 'wait',
    }),
  ).toStrictEqual({
    reached: { turns: 4, dollars: 0.75 },
    failedDollars: null,
    pausedDollars: 0.25,
    commitDollars: null,
    isImpReleased: true,
  });
});

test('it pauses a step that threw after its calls reached the budget, with no turn of its own, and records its spend', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: true,
      spentDollars: 0.25,
      endedTurns: 0,
      isPauseRequested: false,
      next: null,
    }),
  ).toStrictEqual({
    reached: { turns: 3, dollars: 0.75 },
    failedDollars: 0.25,
    pausedDollars: null,
    commitDollars: null,
    isImpReleased: true,
  });
});

test.each([
  ['wait', true],
  ['continue', false],
  ['hold', false],
  ['done', false],
] as const)(
  'it pauses nothing under the budget, leaves the spend to the commit, and sleeps the imp after a step whose next is %s: %s',
  (next, isImpReleased) => {
    expect(
      planTaskTurnEnd({
        used: { turns: 3, dollars: 0.5 },
        isBudgetReached: false,
        spentDollars: 0.004,
        endedTurns: 1,
        isPauseRequested: false,
        next,
      }),
    ).toStrictEqual({
      reached: null,
      failedDollars: null,
      pausedDollars: null,
      commitDollars: 0.004,
      isImpReleased,
    });
  },
);

test('it sleeps the imp after a step with work left whose task the user asked to pause', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: false,
      spentDollars: 0.004,
      endedTurns: 1,
      isPauseRequested: true,
      next: 'continue',
    }),
  ).toStrictEqual({
    reached: null,
    failedDollars: null,
    pausedDollars: null,
    commitDollars: 0.004,
    isImpReleased: true,
  });
});

test('it leaves no spend to the commit of a completed turn that made no priced call', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: false,
      spentDollars: 0,
      endedTurns: 1,
      isPauseRequested: false,
      next: 'done',
    }),
  ).toStrictEqual({
    reached: null,
    failedDollars: null,
    pausedDollars: null,
    commitDollars: null,
    isImpReleased: false,
  });
});

test('it records the spend of a step that threw under the budget, and keeps the imp awake', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: false,
      spentDollars: 0.004,
      endedTurns: 0,
      isPauseRequested: false,
      next: null,
    }),
  ).toStrictEqual({
    reached: null,
    failedDollars: 0.004,
    pausedDollars: null,
    commitDollars: null,
    isImpReleased: false,
  });
});

test('it records no spend for a step that threw before any priced call', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: false,
      spentDollars: 0,
      endedTurns: 0,
      isPauseRequested: false,
      next: null,
    }),
  ).toStrictEqual({
    reached: null,
    failedDollars: null,
    pausedDollars: null,
    commitDollars: null,
    isImpReleased: false,
  });
});
