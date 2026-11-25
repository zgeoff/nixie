import { periodOf } from '@heynixie/periods';
import invariant from 'tiny-invariant';
import type { PeriodName, RouteCount } from '../types';

// The count of a period that has just started at the instant, in the zone.
export function buildEmptyCount(name: PeriodName, nowMs: number, zone: string): RouteCount {
  const period = periodOf(name, nowMs, zone);

  invariant(period.endsAtMs !== null, 'a day and a month end');

  return {
    start: period.start,
    resetsAt: new Date(period.endsAtMs).toISOString(),
    dollars: 0,
    raise: null,
    trippedAt: null,
  };
}
