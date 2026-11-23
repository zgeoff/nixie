import { expect, test } from 'bun:test';
import { formatClock } from './format-clock';

test.each([
  { format: 'HH:mm', expected: '08:05' },
  { format: 'HH:mm:ss', expected: '08:05:09' },
  { format: 'EEE d MMM', expected: 'Sat 21 Nov' },
] as const)('#formatClock writes the time as $format', (row) => {
  expect(formatClock(Date.parse('2026-11-21T08:05:09.000Z'), row.format, 'UTC')).toBe(row.expected);
});

test('#formatClock writes midnight as 00 and never 24', () => {
  expect(formatClock(Date.parse('2026-11-21T00:00:00.000Z'), 'HH:mm', 'UTC')).toBe('00:00');
});

test('#formatClock writes the time of the zone it is given', () => {
  expect(formatClock(Date.parse('2026-11-21T08:05:09.000Z'), 'HH:mm', 'Asia/Tokyo')).toBe('17:05');
});
