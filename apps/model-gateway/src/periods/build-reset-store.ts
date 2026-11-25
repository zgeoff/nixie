import type { PeriodName, PeriodStore, RouteCount, RoutePeriods } from '../types';
import { buildEmptyCount } from './build-empty-count';

// Each route period whose end has passed resets: its count goes to zero, its start and end move to
// the zone's current ones, and its raise drops. The lost mark stays. Returns the same store when no
// period has ended, so a caller can tell a reset from a plain read.
export function buildResetStore(store: PeriodStore, nowMs: number, zone: string): PeriodStore {
  let isChanged = false;

  const reset = (name: PeriodName, count: RouteCount): RouteCount => {
    if (nowMs < Date.parse(count.resetsAt)) {
      return count;
    }

    isChanged = true;

    return buildEmptyCount(name, nowMs, zone);
  };

  const routes = Object.fromEntries(
    Object.entries(store.routes).map(([route, periods]): [string, RoutePeriods] => [
      route,
      { day: reset('day', periods.day), month: reset('month', periods.month) },
    ]),
  );

  return isChanged ? { ...store, routes } : store;
}
