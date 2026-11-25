import { periodOf } from '@heynixie/periods';
import type { PeriodCount, PeriodStore } from '../types';

export function buildFreshStore(nowMs: number, zone: string): PeriodStore {
  return {
    version: 2,
    lost: false,
    periods: {
      day: buildEmptyCount(periodOf('day', nowMs, zone).start),
      month: buildEmptyCount(periodOf('month', nowMs, zone).start),
    },
    sandboxes: {},
  };
}

function buildEmptyCount(start: string): PeriodCount {
  return { start, dollars: 0, tokens: 0, limit: null, raise: null, trippedAt: null };
}
