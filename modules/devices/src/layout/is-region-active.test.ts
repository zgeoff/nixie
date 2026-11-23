import { expect, test } from 'bun:test';
import { isRegionActive } from './is-region-active';

test.each([
  { title: 'content with no end', untilMs: null, expected: true },
  { title: 'content whose end is ahead', untilMs: 1001, expected: true },
  { title: 'content whose end is now', untilMs: 1000, expected: false },
  { title: 'content whose end passed', untilMs: 999, expected: false },
])('#isRegionActive gives $expected for $title', (row) => {
  expect(isRegionActive(row.untilMs, 1000)).toBe(row.expected);
});
