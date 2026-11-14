import { expect, test } from 'bun:test';
import { planTaskStep } from './plan-task-step';

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
