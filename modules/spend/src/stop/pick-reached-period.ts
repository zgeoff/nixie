import type { PeriodName, RoutePeriodStatus } from '../types';

interface Periods {
  readonly day: RoutePeriodStatus;
  readonly month: RoutePeriodStatus;
}

// The period that holds a trip: the day when both are reached, because only the day can be raised.
// A period that has ended at the instant is no trip, so an ended day never hides a month that still
// stands. Null when neither period is at its limit.
export function pickReachedPeriod(periods: Periods, nowMs: number): PeriodName | null {
  const reached = (['day', 'month'] as const).find(
    (name) => periods[name].tripped && Date.parse(periods[name].resetsAt) > nowMs,
  );

  return reached ?? null;
}
