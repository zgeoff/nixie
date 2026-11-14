import { expect, test } from 'bun:test';
import { planTaskTurnEnd } from './plan-task-turn-end';

test('it ends a completed turn that reached the budget as a limit, leaves its spend to the commit and sleeps the imp', () => {
  expect(
    planTaskTurnEnd({
      isBudgetReached: true,
      spentDollars: 0.25,
      isPauseRequested: false,
      next: 'wait',
    }),
  ).toStrictEqual({
    isLimitReached: true,
    failedDollars: null,
    commitDollars: 0.25,
    limitDollars: 0.25,
    isImpReleased: true,
  });
});

test('it records the spend of a step that threw after its calls reached the budget', () => {
  expect(
    planTaskTurnEnd({
      isBudgetReached: true,
      spentDollars: 0.25,
      isPauseRequested: false,
      next: null,
    }),
  ).toStrictEqual({
    isLimitReached: true,
    failedDollars: 0.25,
    commitDollars: null,
    limitDollars: null,
    isImpReleased: true,
  });
});

test.each([
  ['wait', true],
  ['continue', false],
  ['hold', false],
  ['done', false],
] as const)(
  'it ends nothing under the budget, leaves the spend to the commit, and sleeps the imp after a step whose next is %s: %s',
  (next, isImpReleased) => {
    expect(
      planTaskTurnEnd({
        isBudgetReached: false,
        spentDollars: 0.004,
        isPauseRequested: false,
        next,
      }),
    ).toStrictEqual({
      isLimitReached: false,
      failedDollars: null,
      commitDollars: 0.004,
      limitDollars: null,
      isImpReleased,
    });
  },
);

test('it sleeps the imp of a step whose task the owner asked to pause', () => {
  expect(
    planTaskTurnEnd({
      isBudgetReached: false,
      spentDollars: 0,
      isPauseRequested: true,
      next: 'continue',
    }),
  ).toStrictEqual({
    isLimitReached: false,
    failedDollars: null,
    commitDollars: null,
    limitDollars: null,
    isImpReleased: true,
  });
});

test('it records no spend for a step that threw having spent nothing', () => {
  expect(
    planTaskTurnEnd({
      isBudgetReached: false,
      spentDollars: 0,
      isPauseRequested: false,
      next: null,
    }),
  ).toStrictEqual({
    isLimitReached: false,
    failedDollars: null,
    commitDollars: null,
    limitDollars: null,
    isImpReleased: false,
  });
});
