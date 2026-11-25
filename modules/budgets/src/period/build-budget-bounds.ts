import type { Period } from '@heynixie/periods';
import { periodOf } from '@heynixie/periods';
import type { BudgetPeriod } from '@heynixie/policy';
import invariant from 'tiny-invariant';

export interface BudgetBounds {
  readonly period: Period;

  // the instant the period ends, when the next one starts
  readonly resetsAtMs: number;

  // the ISO date on which the next period starts
  readonly resetsOn: string;
}

// The period of a budget that an instant falls in, with when it resets.
export function buildBudgetBounds(
  nowMs: number,
  zone: string,
  budgetPeriod: BudgetPeriod,
): BudgetBounds {
  const period = periodOf(budgetPeriod, nowMs, zone);

  invariant(period.endsAtMs !== null, 'a budget period of a day, a week or a month ends');

  return {
    period,
    resetsAtMs: period.endsAtMs,
    resetsOn: periodOf(budgetPeriod, period.endsAtMs, zone).start,
  };
}
