import { expect, test } from 'bun:test';
import { isImpReleasedAfterStep, planTaskStep } from './plan-task-step';

test('it runs a step under both limits', () => {
  expect(
    planTaskStep({
      used: { turns: 24, dollars: 1.99 },
      limits: { turns: 25, dollars: 2 },
      isImpAwake: true,
      missing: [],
    }),
  ).toStrictEqual({ kind: 'run' });
});

test.each([
  ['the turn limit', { turns: 25, dollars: 0.5 }],
  ['the dollar limit', { turns: 3, dollars: 2 }],
])('it pauses a task at %s', (_case, used) => {
  expect(
    planTaskStep({ used, limits: { turns: 25, dollars: 2 }, isImpAwake: false, missing: [] }),
  ).toStrictEqual({ kind: 'pause', isImpReleased: false });
});

test('it sleeps the awake imp of a task that pauses at its limit', () => {
  expect(
    planTaskStep({
      used: { turns: 25, dollars: 0.5 },
      limits: { turns: 25, dollars: 2 },
      isImpAwake: true,
      missing: [],
    }),
  ).toStrictEqual({ kind: 'pause', isImpReleased: true });
});

test('it refuses a step whose profile runs on a harness that lacks what a task needs', () => {
  expect(
    planTaskStep({
      used: { turns: 0, dollars: 0 },
      limits: { turns: 25, dollars: 2 },
      isImpAwake: false,
      missing: ['turn-limit'],
    }),
  ).toStrictEqual({ kind: 'refuse', missing: ['turn-limit'] });
});

test.each([
  ['wait', true],
  ['continue', false],
  ['done', false],
] as const)('it sleeps the imp after a step whose next is %s: %s', (next, isReleased) => {
  expect(isImpReleasedAfterStep({ next })).toBe(isReleased);
});
