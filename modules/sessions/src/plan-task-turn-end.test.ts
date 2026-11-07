import { expect, test } from 'bun:test';
import { planTaskTurnEnd } from './plan-task-turn-end';

test('it pauses a turn whose calls reached the budget at the counts before it plus its own, and sleeps the imp', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: true,
      spentDollars: 0.25,
      endedTurns: 1,
      next: 'continue',
    }),
  ).toStrictEqual({ reached: { turns: 4, dollars: 0.75 }, isImpReleased: true });
});

test('it pauses a step that threw after its calls reached the budget, with no turn of its own', () => {
  expect(
    planTaskTurnEnd({
      used: { turns: 3, dollars: 0.5 },
      isBudgetReached: true,
      spentDollars: 0.25,
      endedTurns: 0,
      next: null,
    }),
  ).toStrictEqual({ reached: { turns: 3, dollars: 0.75 }, isImpReleased: true });
});

test.each([
  ['wait', true],
  ['continue', false],
  ['hold', false],
  ['done', false],
  [null, false],
] as const)(
  'it pauses nothing under the budget, and sleeps the imp after a step whose next is %s: %s',
  (next, isImpReleased) => {
    expect(
      planTaskTurnEnd({
        used: { turns: 3, dollars: 0.5 },
        isBudgetReached: false,
        spentDollars: 0.004,
        endedTurns: 1,
        next,
      }),
    ).toStrictEqual({ reached: null, isImpReleased });
  },
);
