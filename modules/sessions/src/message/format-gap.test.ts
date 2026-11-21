import { expect, test } from 'bun:test';
import { formatGap } from './format-gap';

test.each([
  { gapMs: 0, shown: '0 s' },
  { gapMs: 40_000, shown: '40 s' },
  { gapMs: 59_999, shown: '59 s' },
  { gapMs: 60_000, shown: '1 min' },
  { gapMs: 12 * 60_000 + 30_000, shown: '12 min' },
  { gapMs: 3_600_000, shown: '1 h' },
  { gapMs: (3 * 60 + 12) * 60_000 + 59_000, shown: '3 h 12 min' },
  { gapMs: 24 * 3_600_000, shown: '1 day' },
  { gapMs: (2 * 24 + 4) * 3_600_000 + 59 * 60_000, shown: '2 days 4 h' },
  { gapMs: 3 * 24 * 3_600_000 + 59 * 60_000, shown: '3 days' },
  { gapMs: -5000, shown: '0 s' },
])('it formats a gap of $gapMs ms as $shown', (row) => {
  expect(formatGap(row.gapMs)).toBe(row.shown);
});
