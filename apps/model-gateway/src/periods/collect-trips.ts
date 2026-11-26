import type { Overrides, PeriodName, PeriodStore, RouteLimits } from '../types';
import { isLimitReached } from './is-limit-reached';
import { pickRouteLimit } from './pick-route-limit';

export interface RouteTrip {
  readonly route: string;
  readonly period: PeriodName;
}

export type RouteLimitsByID = Readonly<Record<string, RouteLimits | null>>;

// every route period whose count has reached its limit in force, a route's day before its month
export function collectTrips(
  store: PeriodStore,
  limits: RouteLimitsByID,
  overrides: Overrides,
): RouteTrip[] {
  const trips: RouteTrip[] = [];

  for (const [route, periods] of Object.entries(store.routes)) {
    for (const period of ['day', 'month'] as const) {
      const limit = pickRouteLimit({ store, limits, overrides, route, period });

      if (limit !== null && isLimitReached(periods[period].micros, limit)) {
        trips.push({ route, period });
      }
    }
  }

  return trips;
}
