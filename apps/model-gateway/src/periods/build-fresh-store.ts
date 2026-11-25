import type { PeriodStore } from '../types';
import { buildEmptyCount } from './build-empty-count';

export function buildFreshStore(nowMs: number, zone: string): PeriodStore {
  return {
    version: 2,
    lost: false,
    periods: {
      day: buildEmptyCount('day', nowMs, zone),
      month: buildEmptyCount('month', nowMs, zone),
    },
    sandboxes: {},
  };
}
