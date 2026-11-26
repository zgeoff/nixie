import type { PeriodStore, RoutePeriods } from '../types';
import { buildEmptyCount } from './build-empty-count';

export function buildEmptyRoute(nowMs: number, zone: string): RoutePeriods {
  return { day: buildEmptyCount('day', nowMs, zone), month: buildEmptyCount('month', nowMs, zone) };
}

// every route and every provider starts at zero
export function buildFreshStore(
  nowMs: number,
  zone: string,
  routeIDs: readonly string[],
  providerIDs: readonly string[],
): PeriodStore {
  return {
    version: 4,
    lost: false,
    providers: Object.fromEntries(providerIDs.map((id) => [id, buildEmptyRoute(nowMs, zone)])),
    routes: Object.fromEntries(routeIDs.map((id) => [id, buildEmptyRoute(nowMs, zone)])),
    sandboxes: {},
  };
}
