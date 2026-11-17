import { expect, test } from 'bun:test';
import { buildSpendPeriods } from './build-spend-periods';

test.each([
  {
    zone: 'UTC',
    now: '2026-11-13T16:42:07Z',
    day: ['2026-11-13', '2026-11-13T00:00:00Z'],
    month: ['2026-11-01', '2026-11-01T00:00:00Z'],
  },
  {
    zone: 'Australia/Sydney',
    now: '2026-11-13T16:42:07Z',
    day: ['2026-11-14', '2026-11-13T13:00:00Z'],
    month: ['2026-11-01', '2026-10-31T13:00:00Z'],
  },
  {
    zone: 'America/New_York',
    now: '2026-11-01T02:30:00Z',
    day: ['2026-10-31', '2026-10-31T04:00:00Z'],
    month: ['2026-10-01', '2026-10-01T04:00:00Z'],
  },
])('it starts the day and the month at midnight in $zone', (row) => {
  const periods = buildSpendPeriods(Date.parse(row.now), row.zone);

  expect([
    periods.day.start,
    new Date(periods.day.startMs).toISOString(),
    periods.month.start,
    new Date(periods.month.startMs).toISOString(),
  ]).toStrictEqual([
    row.day[0],
    row.day[1].replace('Z', '.000Z'),
    row.month[0],
    row.month[1].replace('Z', '.000Z'),
  ]);
});
