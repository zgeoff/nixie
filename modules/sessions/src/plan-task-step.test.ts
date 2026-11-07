import { expect, test } from 'bun:test';
import { isImpReleasedAfterStep, planTaskStep } from './plan-task-step';

test('it runs a step under both limits', () => {
  expect(
    planTaskStep({
      used: { turns: 24, dollars: 1.99 },
      limits: { turns: 25, dollars: 2 },
      isImpAwake: true,
    }),
  ).toStrictEqual({ kind: 'run' });
});

test.each([
  ['the turn limit', { turns: 25, dollars: 0.5 }],
  ['the dollar limit', { turns: 3, dollars: 2 }],
])('it pauses a task at %s', (_case, used) => {
  expect(
    planTaskStep({ used, limits: { turns: 25, dollars: 2 }, isImpAwake: false }),
  ).toStrictEqual({ kind: 'pause', isImpReleased: false });
});

test('it sleeps the awake imp of a task that pauses at its limit', () => {
  expect(
    planTaskStep({
      used: { turns: 25, dollars: 0.5 },
      limits: { turns: 25, dollars: 2 },
      isImpAwake: true,
    }),
  ).toStrictEqual({ kind: 'pause', isImpReleased: true });
});

test.each([
  ['wait', false, true],
  ['continue', false, false],
  ['done', false, false],
  ['continue', true, true],
] as const)(
  'it sleeps the imp after a step whose next is %s and whose turn paused the task is %s: %s',
  (next, isPaused, isReleased) => {
    expect(isImpReleasedAfterStep({ next, isPaused })).toBe(isReleased);
  },
);
