import { expect, test } from 'bun:test';
import { planTaskTurnEnd } from './plan-task-turn-end';

test('it ends a completed turn that reached the limit as a limit and sleeps the imp', () => {
  expect(
    planTaskTurnEnd({ isLimitReached: true, isPauseRequested: false, next: 'wait' }),
  ).toStrictEqual({ isLimitReached: true, isImpReleased: true });
});

test('it sleeps the imp of a step that threw after its turn reached the limit', () => {
  expect(
    planTaskTurnEnd({ isLimitReached: true, isPauseRequested: false, next: null }),
  ).toStrictEqual({ isLimitReached: true, isImpReleased: true });
});

test.each([
  ['wait', true],
  ['continue', false],
  ['hold', false],
  ['done', false],
] as const)(
  'it ends nothing under the limit and sleeps the imp after a step whose next is %s: %s',
  (next, isImpReleased) => {
    expect(planTaskTurnEnd({ isLimitReached: false, isPauseRequested: false, next })).toStrictEqual(
      {
        isLimitReached: false,
        isImpReleased,
      },
    );
  },
);

test('it sleeps the imp of a step whose task the user asked to pause', () => {
  expect(
    planTaskTurnEnd({ isLimitReached: false, isPauseRequested: true, next: 'continue' }),
  ).toStrictEqual({ isLimitReached: false, isImpReleased: true });
});

test('it leaves the imp awake after a step that threw under the limit', () => {
  expect(
    planTaskTurnEnd({ isLimitReached: false, isPauseRequested: false, next: null }),
  ).toStrictEqual({ isLimitReached: false, isImpReleased: false });
});
