import { expect, test } from 'bun:test';
import { planTaskLimitRaise } from './plan-task-limit-raise';

test('it plans the raised turns with the dollars the task reached', () => {
  expect(
    planTaskLimitRaise({ isKnown: true, heldAt: { turns: 25, dollars: 2 } }, { turns: 40 }),
  ).toStrictEqual({ status: 'planned', limits: { turns: 40, dollars: 2 } });
});

test('it refuses a task that does not exist', () => {
  expect(planTaskLimitRaise({ isKnown: false, heldAt: null }, { turns: 40 })).toStrictEqual({
    status: 'refused',
    reason: 'unknown_task',
  });
});

test('it refuses a task that no limit holds', () => {
  expect(planTaskLimitRaise({ isKnown: true, heldAt: null }, { turns: 40 })).toStrictEqual({
    status: 'refused',
    reason: 'not_held',
  });
});

test.each([
  ['the same limits', { turns: 25, dollars: 2 }],
  ['a lower dollar limit beside higher turns', { turns: 40, dollars: 1 }],
])('it refuses %s as no raise', (_case, asked) => {
  expect(
    planTaskLimitRaise({ isKnown: true, heldAt: { turns: 25, dollars: 2 } }, asked),
  ).toStrictEqual({ status: 'refused', reason: 'not_raised' });
});
