import type { PeriodName, PeriodStore, RouteCount, RoutePeriods } from '../types';
import { buildEmptyCount } from './build-empty-count';

// Each route and provider period whose end has passed resets: its count goes to zero, its start
// and end move to the zone's current ones, and its raise drops. The lost mark stays. Returns the
// same store when no period has ended.
export function buildResetStore(store: PeriodStore, nowMs: number, zone: string): PeriodStore {
  let isChanged = false;

  const reset = (name: PeriodName, count: RouteCount): RouteCount => {
    if (nowMs < Date.parse(count.resetsAt)) {
      return count;
    }

    isChanged = true;

    return buildEmptyCount(name, nowMs, zone);
  };

  const resetAll = (held: Readonly<Record<string, RoutePeriods>>): Record<string, RoutePeriods> =>
    Object.fromEntries(
      Object.entries(held).map(([id, periods]): [string, RoutePeriods] => [
        id,
        { day: reset('day', periods.day), month: reset('month', periods.month) },
      ]),
    );

  const routes = resetAll(store.routes);
  const providers = resetAll(store.providers);

  return isChanged ? { ...store, routes, providers } : store;
}
