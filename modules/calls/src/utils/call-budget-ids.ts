// The built-in budgets that each minute of a call charges, in one transaction. The projection
// counts a minute once, on the first of them.
export const callBudgetIDs = ['call-day', 'call-month'] as const;
export const callBudgetName = 'call';
