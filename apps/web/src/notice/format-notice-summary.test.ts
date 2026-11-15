import { expect, test } from 'bun:test';
import { formatNoticeSummary } from './format-notice-summary';

test.each([
  [{ remembered: 3, retired: 0, proposed: 0 }, 'Remembered 3 things'],
  [{ remembered: 1, retired: 0, proposed: 0 }, 'Remembered 1 thing'],
  [{ remembered: 0, retired: 1, proposed: 0 }, 'Retired 1 thing'],
  [
    { remembered: 2, retired: 1, proposed: 1 },
    'Remembered 2 things, Retired 1 thing, Proposed 1 thing',
  ],
  [{ remembered: 0, retired: 0, proposed: 2 }, 'Proposed 2 things'],
] as const)('it sums up the notice %o as "%s"', (notice, expected) => {
  expect(formatNoticeSummary(notice)).toBe(expected);
});
