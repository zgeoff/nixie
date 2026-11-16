import type { Override, PeriodName, PeriodStore } from '../types';
import { pickLimitInForce } from './pick-limit-in-force';

export interface PeriodTrip {
  readonly period: PeriodName;
  readonly measure: 'dollars' | 'tokens';
}

// every period measure whose count has reached its limit in force, the day before the month
export function collectTrips(store: PeriodStore, override: Override | null): PeriodTrip[] {
  const trips: PeriodTrip[] = [];

  for (const period of ['day', 'month'] as const) {
    const count = store.periods[period];
    const limit = pickLimitInForce(period, count, override);

    if (limit === null) {
      continue;
    }

    for (const measure of ['dollars', 'tokens'] as const) {
      if (count[measure] >= limit[measure]) {
        trips.push({ period, measure });
      }
    }
  }

  return trips;
}
