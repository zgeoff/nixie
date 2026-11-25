// The period kind of a charge that names no ledger key: the kind of the budget in force, and the
// kind that the budget's ID ends with when no row holds the budget, as every built-in budget's ID
// does.
export function pickLedgerPeriodKind(
  inForcePeriod: string | undefined,
  budgetID: string,
): 'day' | 'week' | 'month' {
  if (inForcePeriod === 'week' || inForcePeriod === 'month') {
    return inForcePeriod;
  }

  if (inForcePeriod !== undefined) {
    return 'day';
  }

  if (budgetID.endsWith('-month')) {
    return 'month';
  }

  return budgetID.endsWith('-week') ? 'week' : 'day';
}
