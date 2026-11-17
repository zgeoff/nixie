import { expect, test } from 'bun:test';
import { formatZonedISO } from './format-zoned-iso';

test.each([
  ['Australia/Sydney', '2026-11-17T09:00:00Z', '2026-11-17T20:00:00+11:00'],
  ['America/New_York', '2026-01-15T12:30:00Z', '2026-01-15T07:30:00-05:00'],
  ['Asia/Kolkata', '2026-11-17T00:00:00Z', '2026-11-17T05:30:00+05:30'],
])('it formats an instant in %s', (zone, instant, expected) => {
  expect(formatZonedISO(Date.parse(instant), zone)).toBe(expected);
});

test('it drops the milliseconds', () => {
  expect(formatZonedISO(Date.parse('2026-11-17T09:00:00.999Z'), 'UTC')).toBe(
    '2026-11-17T09:00:00+00:00',
  );
});
