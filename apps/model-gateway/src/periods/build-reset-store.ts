import { periodOf } from '@heynixie/periods';
import type { PeriodName, PeriodStore } from '../types';

const periodNames: readonly PeriodName[] = ['day', 'month'];

// Each period whose current start has passed in the zone resets: its count goes to zero, its start
// moves, and its raise drops. The limit and the lost mark stay. Returns the same store when no
// period has ended, so a caller can tell a reset from a plain read.
export function buildResetStore(store: PeriodStore, nowMs: number, zone: string): PeriodStore {
  const starts = {
    day: periodOf('day', nowMs, zone).start,
    month: periodOf('month', nowMs, zone).start,
  };

  const ended = periodNames.filter((name) => starts[name] > store.periods[name].start);

  if (ended.length === 0) {
    return store;
  }

  const reset = (name: PeriodName) =>
    ended.includes(name)
      ? {
          start: starts[name],
          dollars: 0,
          tokens: 0,
          limit: store.periods[name].limit,
          raise: null,
          trippedAt: null,
        }
      : store.periods[name];

  return { ...store, periods: { day: reset('day'), month: reset('month') } };
}
