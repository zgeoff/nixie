import { expect, test } from 'bun:test';
import { buildMockUsageReport } from '../test-utils/build-mock-usage-report';
import { formatUsageLine } from './format-usage-line';

test.each([
  ['an item that never surfaced', {}, 'never surfaced'],
  [
    'an item that never surfaced since a later date',
    { sinceMs: Date.parse('2026-11-03T00:00:00Z') },
    'never surfaced since 3 Nov',
  ],
  [
    'a single push',
    { pushed: 1, lastSurfacedAtMs: Date.parse('2026-11-23T10:00:00Z') },
    'surfaced 1 time (1 by push), last 2 hours ago',
  ],
  [
    'searches and pushes with a recall by ID',
    {
      searched: 9,
      pushed: 5,
      lastSurfacedAtMs: Date.parse('2026-11-20T12:00:00Z'),
      lastRecalledByIDAtMs: Date.parse('2026-11-09T12:00:00Z'),
    },
    'surfaced 14 times (9 by search, 5 by push), last 3 days ago · recalled by ID 2 weeks ago',
  ],
  [
    'counts that start at a later date',
    {
      searched: 2,
      lastSurfacedAtMs: Date.parse('2026-10-14T12:00:00Z'),
      sinceMs: Date.parse('2025-03-09T00:00:00Z'),
    },
    'surfaced 2 times (2 by search) since 9 Mar 2025, last 1 month ago',
  ],
  [
    'a recall by ID alone',
    { lastRecalledByIDAtMs: Date.parse('2026-11-23T11:59:30Z') },
    'never surfaced · recalled by ID just now',
  ],
])('it formats %s', (_name, overrides, expected) => {
  const nowMs = Date.parse('2026-11-23T12:00:00Z');

  expect(formatUsageLine(buildMockUsageReport(overrides), { nowMs, defaultZone: 'UTC' })).toBe(
    expected,
  );
});
