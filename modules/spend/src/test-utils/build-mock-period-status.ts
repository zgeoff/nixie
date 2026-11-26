import type { RoutePeriodStatus } from '../types';

// A day of the default gateway: a limit of 40 dollars under a cap of 80, with nothing spent.
export function buildMockPeriodStatus(
  overrides: Partial<RoutePeriodStatus> = {},
): RoutePeriodStatus {
  return {
    start: '2026-11-13',
    resetsAt: '2026-11-14T00:00:00Z',
    dollars: 0,
    limit: 40,
    cap: 80,
    tripped: false,
    sinceMs: null,
    ...overrides,
  };
}
