import { expect, test } from 'bun:test';
import { formatAge } from './format-age';

test('it formats an age under a minute without a count', () => {
  expect(formatAge(59_999)).toBe('under a minute');
});

test('it formats an age in whole minutes, hours or days, the largest unit that fits', () => {
  const agesMs = [60_000, 59 * 60_000, 60 * 60_000, 23 * 3_600_000, 24 * 3_600_000, 74 * 3_600_000];

  expect(agesMs.map((ageMs) => formatAge(ageMs))).toStrictEqual([
    '1 minute',
    '59 minutes',
    '1 hour',
    '23 hours',
    '1 day',
    '3 days',
  ]);
});
