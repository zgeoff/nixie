import type { BudgetPeriodBounds } from '../period/build-budget-period';
import type { BudgetLimit, BudgetReached } from '../types';

export interface ChargeFact {
  readonly limit: BudgetLimit;
  readonly spentMicros: number;
  readonly bounds: BudgetPeriodBounds;
}

// A charge lands only when every budget has room for the whole amount, so the first budget without
// room refuses it.
export function pickChargeRefusal(
  facts: readonly ChargeFact[],
  amountMicros: number,
): BudgetReached | null {
  const full = facts.find((fact) => fact.spentMicros + amountMicros > fact.limit.limitMicros);

  return full === undefined
    ? null
    : {
        error: 'budget_reached',
        budgetID: full.limit.id,
        period: full.limit.period,
        spentMicros: full.spentMicros,
        limitMicros: full.limit.limitMicros,
        resetsAt: full.bounds.resetsAtMs,
        resetsOn: full.bounds.resetsOn,
      };
}
