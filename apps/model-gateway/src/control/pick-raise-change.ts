import type { Measures, PeriodChange, PeriodName, PeriodStore } from '../types';
import type { ControlOutcome } from './control-outcome';
import { isAboveCap } from './is-above-cap';

export interface DayRaise {
  readonly start: string;
  readonly limit: Measures;
}

// raises the day's limit for the day in force, and refuses without a change past the cap or for a
// day that has ended
export function pickRaiseChange(
  store: PeriodStore,
  caps: Readonly<Record<PeriodName, Measures>>,
  raise: DayRaise,
): PeriodChange<ControlOutcome> {
  if (isAboveCap(raise.limit, caps.day)) {
    return { store: null, result: { kind: 'above_cap', period: 'day', cap: caps.day } };
  }

  if (raise.start !== store.periods.day.start) {
    return { store: null, result: { kind: 'period_ended' } };
  }

  return {
    store: {
      ...store,
      periods: { ...store.periods, day: { ...store.periods.day, raise: raise.limit } },
    },
    result: { kind: 'done' },
  };
}
