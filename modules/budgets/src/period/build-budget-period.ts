import { buildDayStart, buildZoneOffsetMs } from '@heynixie/clock';
import type { BudgetPeriod } from '@heynixie/policy';

export interface BudgetPeriodBounds {
  // the ISO date of the period's first day in the zone
  readonly start: string;

  // the ISO date on which the next period starts
  readonly resetsOn: string;
  readonly startMs: number;
  readonly resetsAtMs: number;
}

// The day, the week from Monday or the month that an instant falls in, each starting at local
// midnight in the zone.
export function buildBudgetPeriod(
  nowMs: number,
  zone: string,
  period: BudgetPeriod,
): BudgetPeriodBounds {
  const local = new Date(nowMs + buildZoneOffsetMs(nowMs, zone));

  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const [first, next] = pickPeriodDates(period, { year, month, day, weekday: local.getUTCDay() });
  const start = first.toISOString().slice(0, 10);
  const resetsOn = next.toISOString().slice(0, 10);

  return {
    start,
    resetsOn,
    startMs: buildDayStart(start, zone),
    resetsAtMs: buildDayStart(resetsOn, zone),
  };
}

interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

function pickPeriodDates(period: BudgetPeriod, local: LocalDate): readonly [Date, Date] {
  if (period === 'day') {
    return [
      new Date(Date.UTC(local.year, local.month, local.day)),
      new Date(Date.UTC(local.year, local.month, local.day + 1)),
    ];
  }

  if (period === 'week') {
    const sinceMonday = (local.weekday + 6) % 7;

    return [
      new Date(Date.UTC(local.year, local.month, local.day - sinceMonday)),
      new Date(Date.UTC(local.year, local.month, local.day - sinceMonday + 7)),
    ];
  }

  return [
    new Date(Date.UTC(local.year, local.month, 1)),
    new Date(Date.UTC(local.year, local.month + 1, 1)),
  ];
}
