import type { Measures, PeriodChange, PeriodName, PeriodStore } from '../types';
import type { ControlOutcome } from './control-outcome';
import { isAboveCap } from './is-above-cap';

type PeriodMeasures = Readonly<Record<PeriodName, Measures>>;

// sets the base limit of both periods, and refuses without a change when either passes its cap
export function pickLimitsChange(
  store: PeriodStore,
  caps: PeriodMeasures,
  limits: PeriodMeasures,
): PeriodChange<ControlOutcome> {
  for (const period of ['day', 'month'] as const) {
    if (isAboveCap(limits[period], caps[period])) {
      return { store: null, result: { kind: 'above_cap', period, cap: caps[period] } };
    }
  }

  return {
    store: {
      ...store,
      periods: {
        day: { ...store.periods.day, limit: limits.day },
        month: { ...store.periods.month, limit: limits.month },
      },
    },
    result: { kind: 'done' },
  };
}
