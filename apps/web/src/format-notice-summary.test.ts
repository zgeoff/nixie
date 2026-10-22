import { expect, test } from 'bun:test';
import { formatNoticeSummary } from './format-notice-summary';

test.each([
  [{ kind: 'turn', remembered: 3, retired: 0, proposed: 0 }, 'Remembered 3 things'],
  [{ kind: 'turn', remembered: 1, retired: 0, proposed: 0 }, 'Remembered 1 thing'],
  [{ kind: 'turn', remembered: 0, retired: 1, proposed: 0 }, 'Retired 1 thing'],
  [
    { kind: 'turn', remembered: 2, retired: 1, proposed: 1 },
    'Remembered 2 things, Retired 1 thing, Proposed 1 thing',
  ],
  [{ kind: 'run', remembered: 0, retired: 0, proposed: 2 }, 'Proposed 2 things'],
  [
    { kind: 'batch', remembered: 4, retired: 0, proposed: 0 },
    'Remembered 4 things from earlier conversation',
  ],
] as const)('it sums up the notice %o as "%s"', (notice, expected) => {
  expect(formatNoticeSummary(notice)).toBe(expected);
});
