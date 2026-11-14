import { expect, test } from 'bun:test';
import { formatZonedTime } from './format-zoned-time';

test.each([
  ['Europe/London', '2026-10-19T08:14:00Z', 'Mon 19 Oct 2026, 09:14, Europe/London (UTC+01:00)'],
  ['Europe/London', '2026-12-19T08:14:00Z', 'Sat 19 Dec 2026, 08:14, Europe/London (UTC+00:00)'],
  ['UTC', '2026-01-02T23:59:00Z', 'Fri 2 Jan 2026, 23:59, UTC (UTC+00:00)'],
  [
    'America/St_Johns',
    '2026-10-19T08:14:00Z',
    'Mon 19 Oct 2026, 05:44, America/St_Johns (UTC-02:30)',
  ],
  [
    'Australia/Melbourne',
    '2026-10-19T13:30:00Z',
    'Tue 20 Oct 2026, 00:30, Australia/Melbourne (UTC+11:00)',
  ],
])('it formats a time in %s at %s as %s', (zone, at, expected) => {
  expect(formatZonedTime(Date.parse(at), zone)).toBe(expected);
});
