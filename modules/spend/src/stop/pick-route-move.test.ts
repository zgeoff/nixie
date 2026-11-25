import { expect, test } from 'bun:test';
import type { RouteTrip } from '../types';
import { pickRouteMove } from './pick-route-move';
import type { SpendRouteStopRow } from './read-spend-route-stops';

function setupTest() {
  const trip: RouteTrip = {
    route: 'plan',
    period: 'day',
    start: '2026-11-13',
    limit: 40,
    spent: 41,
    at: 5,
    resetsAt: 1000,
    canRaise: true,
    cap: 80,
  };

  const row: SpendRouteStopRow = {
    route: 'plan',
    period: 'day',
    limit: 40,
    spent: 41,
    at: 5,
    resetsAt: 1000,
  };

  return { trip, row };
}

test('it trips a route that no stop stands for', () => {
  const ctx = setupTest();

  expect(pickRouteMove([], [ctx.trip], 10)).toStrictEqual({
    clears: [],
    trips: [ctx.trip],
    restates: [],
  });
});

test('it moves nothing when the same stop stands, so a trip sends one notice', () => {
  const ctx = setupTest();

  expect(pickRouteMove([ctx.row], [ctx.trip], 10)).toStrictEqual({
    clears: [],
    trips: [],
    restates: [],
  });
});

test.each([
  { name: 'before its reset', now: 10, reason: 'raised' },
  { name: 'at its reset', now: 1000, reason: 'reset' },
] as const)('it clears the stop of a route that is under its limits $name', (row) => {
  const ctx = setupTest();

  expect(pickRouteMove([ctx.row], [], row.now)).toStrictEqual({
    clears: [{ route: 'plan', reason: row.reason }],
    trips: [],
    restates: [],
  });
});

test.each([
  { name: 'limit differs', changed: { limit: 60 } },
  { name: 'period differs', changed: { period: 'month' as const } },
  { name: 'reset differs', changed: { resetsAt: 2000 } },
])('it restates a stop whose $name, and clears nothing, so the route keeps its holds', (row) => {
  const ctx = setupTest();
  const changed = { ...ctx.trip, ...row.changed };

  expect(pickRouteMove([ctx.row], [changed], 10)).toStrictEqual({
    clears: [],
    trips: [],
    restates: [changed],
  });
});

test('it writes no trip for a route whose period has ended', () => {
  const ctx = setupTest();

  expect(pickRouteMove([], [ctx.trip], 1000)).toStrictEqual({
    clears: [],
    trips: [],
    restates: [],
  });
});

test('it leaves the stop of another route alone', () => {
  const ctx = setupTest();
  const other = { ...ctx.trip, route: 'metered' };

  expect(pickRouteMove([ctx.row], [ctx.trip, other], 10)).toStrictEqual({
    clears: [],
    trips: [other],
    restates: [],
  });
});
