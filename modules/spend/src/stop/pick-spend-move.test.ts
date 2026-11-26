import { expect, test } from 'bun:test';
import { buildSpendStopRow, buildTrippedStop } from '../test-utils';
import { pickSpendMove } from './pick-spend-move';

test('it moves nothing when the stop is clear and none stands', () => {
  const move = pickSpendMove(null, { state: 'clear' }, Date.parse('2026-11-13T16:42:07Z'));

  expect(move).toStrictEqual({ clear: null, trip: null });
});

test.each([
  {
    name: 'a limit trip before its reset',
    row: buildSpendStopRow(),
    now: '2026-11-13T17:00:00Z',
    reason: 'raised',
  },
  {
    name: 'a limit trip after its reset',
    row: buildSpendStopRow(),
    now: '2026-11-14T00:00:00Z',
    reason: 'reset',
  },
  {
    name: 'an unreachable stop',
    row: buildSpendStopRow({ reason: 'unreachable' }),
    now: '2026-11-13T17:00:00Z',
    reason: 'reachable',
  },
  {
    name: 'the lost mark',
    row: buildSpendStopRow({ reason: 'lost' }),
    now: '2026-11-13T17:00:00Z',
    reason: 'lost_cleared',
  },
])('it clears $name with the reason $reason', (row) => {
  const move = pickSpendMove(row.row, { state: 'clear' }, Date.parse(row.now));

  expect(move).toStrictEqual({ clear: row.reason, trip: null });
});

test('it trips a stop that none stands for', () => {
  const move = pickSpendMove(null, buildTrippedStop(), Date.parse('2026-11-13T16:42:07Z'));

  expect(move).toStrictEqual({
    clear: null,
    trip: {
      reason: 'limit',
      at: Date.parse('2026-11-13T16:42:07Z'),
      period: 'day',
      measure: 'turns',
      limit: 1000,
      spent: 1000,
      resetsAt: Date.parse('2026-11-14T00:00:00Z'),
    },
  });
});

test.each([
  { state: 'unreachable', reason: 'unreachable' },
  { state: 'lost', reason: 'lost' },
] as const)('it trips $state with the time only', (row) => {
  const move = pickSpendMove(null, { state: row.state }, 1000);

  expect(move).toStrictEqual({ clear: null, trip: { reason: row.reason, at: 1000 } });
});

test('it moves nothing when the same stop stands', () => {
  const move = pickSpendMove(buildSpendStopRow(), buildTrippedStop(), 1000);

  expect(move).toStrictEqual({ clear: null, trip: null });
});

test.each([
  { name: 'another period', stop: buildTrippedStop({ period: 'month' }) },
  { name: 'a raised limit', stop: buildTrippedStop({ limit: 1500 }) },
  {
    name: 'a later reset',
    stop: buildTrippedStop({ resetsAt: Date.parse('2026-11-15T00:00:00Z') }),
  },
  { name: 'another reason', stop: { state: 'lost' } },
] as const)('it clears the standing stop and trips again for $name', (row) => {
  const move = pickSpendMove(buildSpendStopRow(), row.stop, Date.parse('2026-11-13T17:00:00Z'));

  expect(move).toMatchObject({ clear: 'raised', trip: {} });
});
