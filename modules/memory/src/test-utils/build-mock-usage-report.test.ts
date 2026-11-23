import { expect, test } from 'bun:test';
import { buildMockUsageReport } from './build-mock-usage-report';

test('it builds the report of an item that never surfaced and lets a field be replaced', () => {
  expect(buildMockUsageReport({ pushed: 2 })).toStrictEqual({
    searched: 0,
    pushed: 2,
    lastSurfacedAtMs: null,
    lastRecalledByIDAtMs: null,
    firedTriggers: [],
    lastUnkeyedPushAtMs: null,
    sinceMs: null,
  });
});
