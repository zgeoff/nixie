import type { Period } from '@heynixie/periods';

// The key of the spend ledger row that a budget and a period share, which counts micros of US
// dollars. A budget ID is a slug, so it holds none of the separators.
export function buildBudgetLedgerKey(
  budgetID: string,
  period: Pick<Period, 'kind' | 'start'>,
): string {
  return [`budget:${budgetID}`, 'micros:USD', period.kind, period.start].join('|');
}
