import { expect, test } from 'bun:test';
import { formatCallTime } from './format-call-time';

test.each([
  { elapsedMs: -5, text: '0:00' },
  { elapsedMs: 0, text: '0:00' },
  { elapsedMs: 65_900, text: '1:05' },
  { elapsedMs: 3_599_000, text: '59:59' },
  { elapsedMs: 3_725_000, text: '1:02:05' },
])('#formatCallTime writes $elapsedMs ms as $text', (row) => {
  expect(formatCallTime(row.elapsedMs)).toBe(row.text);
});
