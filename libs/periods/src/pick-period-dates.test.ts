import { expect, test } from 'bun:test';
import { pickPeriodDates } from './pick-period-dates';

test.each([
  {
    kind: 'day',
    local: { year: 2026, month: 9, day: 16, weekday: 5 },
    first: '2026-10-16',
    next: '2026-10-17',
  },
  {
    kind: 'week',
    local: { year: 2026, month: 9, day: 18, weekday: 0 },
    first: '2026-10-12',
    next: '2026-10-19',
  },
  {
    kind: 'month',
    local: { year: 2026, month: 11, day: 31, weekday: 4 },
    first: '2026-12-01',
    next: '2027-01-01',
  },
] as const)('it picks the $kind that holds $first and the one after', (row) => {
  const dates = pickPeriodDates(row.kind, row.local).map((date) => date.toISOString().slice(0, 10));

  expect(dates).toStrictEqual([row.first, row.next]);
});
