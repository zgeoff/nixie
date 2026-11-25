import type { PeriodStore, RoutePeriods } from '../types';
import { buildEmptyCount } from './build-empty-count';

export function buildEmptyRoute(nowMs: number, zone: string): RoutePeriods {
  return { day: buildEmptyCount('day', nowMs, zone), month: buildEmptyCount('month', nowMs, zone) };
}

// every route starts at zero
export function buildFreshStore(
  nowMs: number,
  zone: string,
  routeIDs: readonly string[],
): PeriodStore {
  return {
    version: 3,
    lost: false,
    routes: Object.fromEntries(routeIDs.map((id) => [id, buildEmptyRoute(nowMs, zone)])),
    sandboxes: {},
  };
}
