import { expect, test } from 'bun:test';
import { formatEventTime } from './format-event-time';

test('it formats a time as its weekday, day, month, 24-hour time and city in the zone', () => {
  expect(formatEventTime(Date.UTC(2025, 9, 13, 22, 12), 'Australia/Sydney')).toBe(
    'Tue 14 Oct, 09:12, Sydney',
  );
});

test.each([
  ['America/New_York', 'Tue 14 Oct, 05:12, New York'],
  ['UTC', 'Tue 14 Oct, 09:12, UTC'],
])('it names the city of %s with spaces, or the zone itself', (zone, expected) => {
  expect(formatEventTime(Date.UTC(2025, 9, 14, 9, 12), zone)).toBe(expected);
});

test('it formats a time just after midnight as hour 00', () => {
  expect(formatEventTime(Date.UTC(2025, 9, 14, 0, 5), 'UTC')).toBe('Tue 14 Oct, 00:05, UTC');
});
