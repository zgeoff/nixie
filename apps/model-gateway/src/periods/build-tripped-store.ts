import type { Overrides, PeriodName, PeriodStore, RouteCount } from '../types';
import type { RouteLimitsByID } from './collect-trips';
import { collectTrips } from './collect-trips';

// Stamps each route period that has reached its limit in force with the instant it was first seen
// there, and clears the stamp of each one under it. Returns the same store when no stamp changes,
// so a caller writes only a change.
export function buildTrippedStore(
  store: PeriodStore,
  limits: RouteLimitsByID,
  overrides: Overrides,
  at: string,
): PeriodStore {
  const tripped = new Set(
    collectTrips(store, limits, overrides).map((trip) => `${trip.route}|${trip.period}`),
  );

  let isChanged = false;

  const routes = Object.fromEntries(
    Object.entries(store.routes).map(([route, periods]) => {
      const stamp = (name: PeriodName): RouteCount => {
        const count = periods[name];
        const trippedAt = tripped.has(`${route}|${name}`) ? (count.trippedAt ?? at) : null;

        if (trippedAt === count.trippedAt) {
          return count;
        }

        isChanged = true;

        return { ...count, trippedAt };
      };

      return [route, { day: stamp('day'), month: stamp('month') }];
    }),
  );

  return isChanged ? { ...store, routes } : store;
}
