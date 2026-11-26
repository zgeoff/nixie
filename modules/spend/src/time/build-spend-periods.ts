import type { Period } from '@heynixie/periods';
import { periodOf } from '@heynixie/periods';
import invariant from 'tiny-invariant';
import type { PeriodName } from '../types';

export interface SpendPeriodStart {
  // the ISO date of the period's first day in the zone
  readonly start: string;
  readonly startMs: number;

  // when the next period starts, which is when this one resets
  readonly resetsAtMs: number;
}

// The day and the month that an instant falls in, each starting at local midnight in the zone.
export function buildSpendPeriods(
  nowMs: number,
  zone: string,
): Readonly<Record<PeriodName, SpendPeriodStart>> {
  return {
    day: toSpendPeriodStart(periodOf('day', nowMs, zone)),
    month: toSpendPeriodStart(periodOf('month', nowMs, zone)),
  };
}

function toSpendPeriodStart(period: Period): SpendPeriodStart {
  invariant(period.endsAtMs !== null, 'a day and a month end');

  return { start: period.start, startMs: period.startsAtMs, resetsAtMs: period.endsAtMs };
}
