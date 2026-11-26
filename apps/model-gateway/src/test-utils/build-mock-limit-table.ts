import type { LimitTable } from '../periods/limit-table';
import type { RouteLimits } from '../types';

const roomyProvider: RouteLimits = { day: 10_000, month: 100_000, dayCap: 20_000 };

// A limit table with each route on the provider `test`, whose limits are roomy unless a test names
// its own
export function buildMockLimitTable(
  routes: Readonly<Record<string, RouteLimits | null>>,
  providerLimits: RouteLimits = roomyProvider,
): LimitTable {
  return {
    routes,
    providers: { test: providerLimits },
    providerOf: Object.fromEntries(Object.keys(routes).map((id) => [id, 'test'])),
  };
}
