import type { Overrides, PeriodName, PeriodStore, RouteCount, RoutePeriods } from '../types';
import { collectTrips } from './collect-trips';
import type { LimitTable } from './limit-table';

// Stamps each period that has reached its limit in force with the instant it was first seen there,
// and clears the stamp of each one under it. Returns the same store when no stamp changes, so a
// caller writes only a change.
export function buildTrippedStore(
  store: PeriodStore,
  limits: LimitTable,
  overrides: Overrides,
  at: string,
): PeriodStore {
  const tripped = new Set(
    collectTrips(store, limits, overrides).map((trip) => `${trip.scope}|${trip.id}|${trip.period}`),
  );

  let isChanged = false;

  const stampAll = (
    scope: 'route' | 'provider',
    held: Readonly<Record<string, RoutePeriods>>,
  ): Record<string, RoutePeriods> =>
    Object.fromEntries(
      Object.entries(held).map(([id, periods]) => {
        const stamp = (name: PeriodName): RouteCount => {
          const count = periods[name];
          const trippedAt = tripped.has(`${scope}|${id}|${name}`) ? (count.trippedAt ?? at) : null;

          if (trippedAt === count.trippedAt) {
            return count;
          }

          isChanged = true;

          return { ...count, trippedAt };
        };

        return [id, { day: stamp('day'), month: stamp('month') }];
      }),
    );

  const routes = stampAll('route', store.routes);
  const providers = stampAll('provider', store.providers);

  return isChanged ? { ...store, routes, providers } : store;
}
