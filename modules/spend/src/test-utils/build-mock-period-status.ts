import type { PeriodStatus } from '../types';

// A day of the default gateway: 60 dollars of limit under a cap of 120, with nothing spent.
export function buildMockPeriodStatus(overrides: Partial<PeriodStatus> = {}): PeriodStatus {
  return {
    start: '2026-11-13',
    resetsAt: '2026-11-14T00:00:00Z',
    spent: { dollars: 0, tokens: 0 },
    limit: { dollars: 60, tokens: 80_000_000 },
    cap: { dollars: 120, tokens: 160_000_000 },
    ...overrides,
  };
}
