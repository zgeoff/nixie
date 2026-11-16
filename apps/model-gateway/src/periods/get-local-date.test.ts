import { expect, test } from 'bun:test';
import { getLocalDate } from './get-local-date';

test.each([
  ['2026-11-13T23:59:59Z', 'Europe/London', '2026-11-13'],
  ['2026-06-13T23:30:00Z', 'Europe/London', '2026-06-14'],
  ['2026-11-13T23:30:00Z', 'Asia/Tokyo', '2026-11-14'],
  ['2026-11-13T03:00:00Z', 'America/Los_Angeles', '2026-11-12'],
])('#getLocalDate puts %s in %s on %s', (instant, zone, expected) => {
  expect(getLocalDate(Date.parse(instant), zone)).toBe(expected);
});
