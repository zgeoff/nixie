import { expect, test } from 'bun:test';
import { buildDayStart } from './build-day-start';

test.each([
  { zone: 'UTC', date: '2027-03-01', expected: '2027-03-01T00:00:00.000Z' },
  { zone: 'Australia/Sydney', date: '2027-03-01', expected: '2027-02-28T13:00:00.000Z' },
  { zone: 'America/New_York', date: '2027-03-14', expected: '2027-03-14T05:00:00.000Z' },
])('#buildDayStart starts $date at $expected in $zone', (row) => {
  expect(new Date(buildDayStart(row.date, row.zone)).toISOString()).toBe(row.expected);
});
