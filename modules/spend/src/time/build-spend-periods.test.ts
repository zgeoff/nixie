import { expect, test } from 'bun:test';
import { buildSpendPeriods } from './build-spend-periods';

test.each([
  {
    zone: 'UTC',
    now: '2026-11-13T16:42:07Z',
    day: ['2026-11-13', '2026-11-13T00:00:00.000Z', '2026-11-14T00:00:00.000Z'],
    month: ['2026-11-01', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'],
  },
  {
    zone: 'Australia/Sydney',
    now: '2026-11-13T16:42:07Z',
    day: ['2026-11-14', '2026-11-13T13:00:00.000Z', '2026-11-14T13:00:00.000Z'],
    month: ['2026-11-01', '2026-10-31T13:00:00.000Z', '2026-11-30T13:00:00.000Z'],
  },
  {
    zone: 'America/New_York',
    now: '2026-11-01T02:30:00Z',
    day: ['2026-10-31', '2026-10-31T04:00:00.000Z', '2026-11-01T04:00:00.000Z'],
    month: ['2026-10-01', '2026-10-01T04:00:00.000Z', '2026-11-01T04:00:00.000Z'],
  },
  {
    zone: 'UTC',
    now: '2026-12-31T23:59:59Z',
    day: ['2026-12-31', '2026-12-31T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    month: ['2026-12-01', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
  },
])('it starts and resets the day and the month at midnight in $zone', (row) => {
  const periods = buildSpendPeriods(Date.parse(row.now), row.zone);

  expect([
    periods.day.start,
    new Date(periods.day.startMs).toISOString(),
    new Date(periods.day.resetsAtMs).toISOString(),
    periods.month.start,
    new Date(periods.month.startMs).toISOString(),
    new Date(periods.month.resetsAtMs).toISOString(),
  ]).toStrictEqual([...row.day, ...row.month]);
});
