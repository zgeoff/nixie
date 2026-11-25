import { expect, test } from 'bun:test';
import { pickLedgerPeriodKind } from './pick-ledger-period-kind';

test.each([
  { inForcePeriod: 'week', budgetID: 'groceries', kind: 'week' },
  { inForcePeriod: 'month', budgetID: 'groceries-day', kind: 'month' },
  { inForcePeriod: undefined, budgetID: 'search-month', kind: 'month' },
  { inForcePeriod: undefined, budgetID: 'shopping-week', kind: 'week' },
  { inForcePeriod: undefined, budgetID: 'groceries', kind: 'day' },
] as const)(
  'it picks the $kind kind for the budget $budgetID in force with the period $inForcePeriod',
  (row) => {
    expect(pickLedgerPeriodKind(row.inForcePeriod, row.budgetID)).toBe(row.kind);
  },
);
