import type { Overrides, PeriodName, PeriodStore } from '../types';
import { isLimitReached } from './is-limit-reached';
import type { LimitTable } from './limit-table';
import { pickProviderLimit, pickRouteLimit } from './pick-route-limit';

export interface LimitTrip {
  readonly scope: 'route' | 'provider';
  readonly id: string;
  readonly period: PeriodName;
}

// every period whose count has reached its limit in force: the routes' before the providers', a
// day before its month
export function collectTrips(
  store: PeriodStore,
  limits: LimitTable,
  overrides: Overrides,
): LimitTrip[] {
  const trips: LimitTrip[] = [];

  for (const [id, periods] of Object.entries(store.routes)) {
    for (const period of ['day', 'month'] as const) {
      const limit = pickRouteLimit({ store, limits, overrides, id, period });

      if (limit !== null && isLimitReached(periods[period].micros, limit)) {
        trips.push({ scope: 'route', id, period });
      }
    }
  }

  for (const [id, periods] of Object.entries(store.providers)) {
    for (const period of ['day', 'month'] as const) {
      const limit = pickProviderLimit({ store, limits, overrides, id, period });

      if (limit !== null && isLimitReached(periods[period].micros, limit)) {
        trips.push({ scope: 'provider', id, period });
      }
    }
  }

  return trips;
}
