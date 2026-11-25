import type { BudgetLimit, BudgetReached } from '../types';

export interface ChargeFact {
  readonly limit: BudgetLimit;
  readonly spentMicros: number;

  // the ledger row the charge adds to, which names the budget's period in force
  readonly ledgerKey: string;
  readonly periodStart: string;

  // the instant the period ends, and the ISO date on which the next one starts
  readonly resetsAtMs: number;
  readonly resetsOn: string;
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
        resetsAt: full.resetsAtMs,
        resetsOn: full.resetsOn,
      };
}
