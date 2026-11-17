import { expect, test } from 'bun:test';
import { buildSpendPeriods } from '../time/build-spend-periods';
import { pickTurnTrip } from './pick-turn-trip';

test.each([
  { name: 'under both limits', turns: { day: 2, month: 3 }, raise: null, expected: null },
  {
    name: 'at the day limit',
    turns: { day: 3, month: 3 },
    raise: null,
    expected: {
      reason: 'limit',
      at: 1_794_588_127_000,
      measure: 'turns',
      period: 'day',
      limit: 3,
      spent: 3,
      resetsAt: 1_794_614_400_000,
    },
  },
  {
    name: 'at the month limit with the day under',
    turns: { day: 2, month: 4 },
    raise: null,
    expected: {
      reason: 'limit',
      at: 1_794_588_127_000,
      measure: 'turns',
      period: 'month',
      limit: 4,
      spent: 4,
      resetsAt: 1_796_083_200_000,
    },
  },
  {
    name: 'at the day limit that a raise moved up',
    turns: { day: 5, month: 5 },
    raise: { dollars: 1, tokens: 1, turns: 5, by: 'host' },
    expected: {
      reason: 'limit',
      at: 1_794_588_127_000,
      measure: 'turns',
      period: 'day',
      limit: 5,
      spent: 5,
      resetsAt: 1_794_614_400_000,
    },
  },
  {
    name: 'under the day limit that a raise moved up',
    turns: { day: 3, month: 3 },
    raise: { dollars: 1, tokens: 1, turns: 5, by: 'host' },
    expected: null,
  },
])('it picks $name', (row) => {
  const trip = pickTurnTrip({
    turns: row.turns,
    raise: row.raise,
    limits: { dayTurns: 3, dayTurnCap: 5, monthTurns: 4 },
    periods: buildSpendPeriods(1_794_588_127_000, 'UTC'),
    now: 1_794_588_127_000,
  });

  expect(trip).toStrictEqual(row.expected);
});
