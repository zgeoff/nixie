import type { BudgetLimit } from '../types';

// A budget in force with the same ID as a built-in budget sets its limit.
export function pickBudgetLimit(
  budgetID: string,
  inForce: readonly BudgetLimit[],
  builtIn: readonly BudgetLimit[],
): BudgetLimit | null {
  return (
    inForce.find((budget) => budget.id === budgetID) ??
    builtIn.find((budget) => budget.id === budgetID) ??
    null
  );
}
