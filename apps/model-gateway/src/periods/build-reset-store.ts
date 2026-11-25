import type { PeriodName, PeriodStore } from '../types';
import { buildEmptyCount } from './build-empty-count';
import { buildResetMs } from './build-reset-ms';

const periodNames: readonly PeriodName[] = ['day', 'month'];

// Each period whose end has passed resets: its count goes to zero, its start and end move to the
// zone's current ones, and its raise drops. The limit and the lost mark stay. Returns the same
// store when no period has ended, so a caller can tell a reset from a plain read.
export function buildResetStore(store: PeriodStore, nowMs: number, zone: string): PeriodStore {
  const ended = periodNames.filter((name) => nowMs >= buildResetMs(name, store.periods[name]));

  if (ended.length === 0) {
    return store;
  }

  const reset = (name: PeriodName) =>
    ended.includes(name)
      ? buildEmptyCount(name, nowMs, zone, store.periods[name].limit)
      : store.periods[name];

  return { ...store, periods: { day: reset('day'), month: reset('month') } };
}
