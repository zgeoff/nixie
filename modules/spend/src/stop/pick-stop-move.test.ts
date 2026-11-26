import { expect, test } from 'bun:test';
import type { StopLimit } from './pick-stop-move';
import { pickStopMove } from './pick-stop-move';

function setupTest() {
  const trip: StopLimit & { route: string } = {
    route: 'plan',
    period: 'day',
    limit: 40,
    resetsAt: 1000,
  };

  const row: StopLimit & { route: string } = {
    route: 'plan',
    period: 'day',
    limit: 40,
    resetsAt: 1000,
  };

  return { trip, row };
}

test('it trips a stop that no stop stands for', () => {
  const ctx = setupTest();

  expect(
    pickStopMove({
      field: 'route',
      standing: [],
      trips: [ctx.trip],
      nowMs: 10,
      roomReason: 'raised',
    }),
  ).toStrictEqual({
    clears: [],
    trips: [ctx.trip],
    restates: [],
  });
});

test('it moves nothing when the same stop stands, so a trip sends one notice', () => {
  const ctx = setupTest();

  expect(
    pickStopMove({
      field: 'route',
      standing: [ctx.row],
      trips: [ctx.trip],
      nowMs: 10,
      roomReason: 'raised',
    }),
  ).toStrictEqual({
    clears: [],
    trips: [],
    restates: [],
  });
});

test.each([
  { name: 'before its reset', now: 10, reason: 'raised' },
  { name: 'at its reset', now: 1000, reason: 'reset' },
] as const)('it clears the stop of a stop that is under its limits $name', (row) => {
  const ctx = setupTest();

  expect(
    pickStopMove({
      field: 'route',
      standing: [ctx.row],
      trips: [],
      nowMs: row.now,
      roomReason: 'raised',
    }),
  ).toStrictEqual({
    clears: [{ key: 'plan', reason: row.reason }],
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

  expect(
    pickStopMove({
      field: 'route',
      standing: [ctx.row],
      trips: [changed],
      nowMs: 10,
      roomReason: 'raised',
    }),
  ).toStrictEqual({
    clears: [],
    trips: [],
    restates: [changed],
  });
});

test('it writes no trip for a stop whose period has ended', () => {
  const ctx = setupTest();

  expect(
    pickStopMove({
      field: 'route',
      standing: [],
      trips: [ctx.trip],
      nowMs: 1000,
      roomReason: 'raised',
    }),
  ).toStrictEqual({
    clears: [],
    trips: [],
    restates: [],
  });
});

test('it leaves the stop of another stop alone', () => {
  const ctx = setupTest();
  const other = { ...ctx.trip, route: 'metered' };

  expect(
    pickStopMove({
      field: 'route',
      standing: [ctx.row],
      trips: [ctx.trip, other],
      nowMs: 10,
      roomReason: 'raised',
    }),
  ).toStrictEqual({
    clears: [],
    trips: [other],
    restates: [],
  });
});

test('it clears a stop before its reset with the reason the caller names for the room', () => {
  const ctx = setupTest();

  expect(
    pickStopMove({
      field: 'route',
      standing: [ctx.row],
      trips: [],
      nowMs: 10,
      roomReason: 'corrected',
    }),
  ).toStrictEqual({
    clears: [{ key: 'plan', reason: 'corrected' }],
    trips: [],
    restates: [],
  });
});
