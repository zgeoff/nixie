import type { LimitTrip } from '../periods/collect-trips';
import type { PeriodStore } from '../types';

// One text that names each trip standing in the store and the instant it began. A correction that
// clears a trip and a later trip of the same period give two keys, so each trip logs once.
export function buildTripKey(store: PeriodStore, trips: readonly LimitTrip[]): string {
  return trips
    .map((trip) => {
      const held = trip.scope === 'route' ? store.routes : store.providers;

      const trippedAt = Object.hasOwn(held, trip.id)
        ? held[trip.id]?.[trip.period].trippedAt
        : null;

      return `${trip.scope}:${trip.id}:${trip.period}@${trippedAt ?? ''}`;
    })
    .join(',');
}
