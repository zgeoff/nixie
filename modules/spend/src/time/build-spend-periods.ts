import { buildDayStart, buildZoneOffsetMs } from '@heynixie/triggers';
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
  const local = new Date(nowMs + buildZoneOffsetMs(nowMs, zone));

  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  return {
    day: buildPeriodStart(
      new Date(Date.UTC(year, month, day)),
      new Date(Date.UTC(year, month, day + 1)),
      zone,
    ),
    month: buildPeriodStart(
      new Date(Date.UTC(year, month, 1)),
      new Date(Date.UTC(year, month + 1, 1)),
      zone,
    ),
  };
}

function buildPeriodStart(first: Date, next: Date, zone: string): SpendPeriodStart {
  const start = first.toISOString().slice(0, 10);

  return {
    start,
    startMs: buildDayStart(start, zone),
    resetsAtMs: buildDayStart(next.toISOString().slice(0, 10), zone),
  };
}
