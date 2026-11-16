import type { PeriodCount, PeriodStore } from '../types';
import { getPeriodStart } from './get-period-start';

export function buildFreshStore(today: string): PeriodStore {
  return {
    version: 2,
    lost: false,
    periods: {
      day: buildEmptyCount(getPeriodStart('day', today)),
      month: buildEmptyCount(getPeriodStart('month', today)),
    },
    sandboxes: {},
  };
}

function buildEmptyCount(start: string): PeriodCount {
  return { start, dollars: 0, tokens: 0, limit: null, raise: null };
}
