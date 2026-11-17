import { buildDayStart, buildZoneOffsetMs } from '@heynixie/triggers';
import type { PeriodName } from '../types';

export interface SpendPeriodStart {
  // the ISO date of the period's first day in the zone
  readonly start: string;
  readonly startMs: number;
}

// The day and the month that an instant falls in, each starting at local midnight in the zone.
export function buildSpendPeriods(
  nowMs: number,
  zone: string,
): Readonly<Record<PeriodName, SpendPeriodStart>> {
  const local = new Date(nowMs + buildZoneOffsetMs(nowMs, zone));

  const year = String(local.getUTCFullYear()).padStart(4, '0');
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  const dayDate = `${year}-${month}-${day}`;
  const monthDate = `${year}-${month}-01`;

  return {
    day: { start: dayDate, startMs: buildDayStart(dayDate, zone) },
    month: { start: monthDate, startMs: buildDayStart(monthDate, zone) },
  };
}
