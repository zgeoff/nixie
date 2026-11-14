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
  ['the turn limit', { turns: 25, dollars: 0.5 }, 'turns'],
  ['the dollar limit', { turns: 3, dollars: 2 }, 'dollars'],
  ['both limits, which the turns meter wins', { turns: 25, dollars: 2 }, 'turns'],
] as const)('it pauses a task at %s', (_case, used, meter) => {
  expect(
    planTaskStep({ used, limits: { turns: 25, dollars: 2 }, isImpAwake: false }),
  ).toStrictEqual({ kind: 'pause', meter, isImpReleased: false });
});

test('it sleeps the awake imp of a task that pauses at its limit', () => {
  expect(
    planTaskStep({
      used: { turns: 25, dollars: 0.5 },
      limits: { turns: 25, dollars: 2 },
      isImpAwake: true,
    }),
  ).toStrictEqual({ kind: 'pause', meter: 'turns', isImpReleased: true });
});
