import type { Override, PeriodCount, PeriodName, PeriodStore } from '../types';
import { collectTrips } from './collect-trips';

// Stamps each period that has reached its limit in force with the instant it was first seen there,
// and clears the stamp of each period under it. Returns the same store when no stamp changes, so a
// caller writes only a change.
export function buildTrippedStore(
  store: PeriodStore,
  override: Override | null,
  at: string,
): PeriodStore {
  const tripped = new Set(collectTrips(store, override).map((trip) => trip.period));

  const stamp = (name: PeriodName): PeriodCount => {
    const count = store.periods[name];
    const trippedAt = tripped.has(name) ? (count.trippedAt ?? at) : null;

    return trippedAt === count.trippedAt ? count : { ...count, trippedAt };
  };

  const day = stamp('day');
  const month = stamp('month');

  if (day === store.periods.day && month === store.periods.month) {
    return store;
  }

  return { ...store, periods: { day, month } };
}
