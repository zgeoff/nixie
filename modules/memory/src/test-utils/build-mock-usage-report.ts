import type { ItemUsageReport } from '../usage/types';

export function buildMockUsageReport(overrides: Partial<ItemUsageReport> = {}): ItemUsageReport {
  return {
    searched: 0,
    pushed: 0,
    lastSurfacedAtMs: null,
    lastRecalledByIDAtMs: null,
    firedTriggers: [],
    hasUnkeyedPush: false,
    sinceMs: null,
    ...overrides,
  };
}
