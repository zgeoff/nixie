export type LedgerPeriodKind = 'day' | 'week' | 'month';

export function isLedgerPeriodKind(value: string): value is LedgerPeriodKind {
  return value === 'day' || value === 'week' || value === 'month';
}

// The period kind of a charge that names no ledger key: the budget's kind in force, then the kind of
// a built-in budget's ID, when the charge's period start is a start of it, and else a day.
export function pickLedgerPeriodKind(
  inForcePeriod: string | undefined,
  budgetID: string,
  periodStart: string,
): LedgerPeriodKind {
  const isMonthStart = periodStart.slice(8, 10) === '01';
  const isWeekStart = new Date(`${periodStart}T00:00:00Z`).getUTCDay() === 1;

  if (isMonthStart && (inForcePeriod === 'month' || budgetID.endsWith('-month'))) {
    return 'month';
  }

  if (isWeekStart && (inForcePeriod === 'week' || budgetID.endsWith('-week'))) {
    return 'week';
  }

  return 'day';
}
