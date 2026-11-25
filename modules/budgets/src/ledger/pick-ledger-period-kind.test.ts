import { expect, test } from 'bun:test';
import { pickLedgerPeriodKind } from './pick-ledger-period-kind';

test.each([
  { inForcePeriod: 'week', budgetID: 'groceries', periodStart: '2026-10-12', kind: 'week' },
  { inForcePeriod: 'month', budgetID: 'groceries-day', periodStart: '2026-10-01', kind: 'month' },
  { inForcePeriod: undefined, budgetID: 'search-month', periodStart: '2026-10-01', kind: 'month' },
  { inForcePeriod: undefined, budgetID: 'shopping-week', periodStart: '2026-10-12', kind: 'week' },
  { inForcePeriod: undefined, budgetID: 'groceries', periodStart: '2026-10-16', kind: 'day' },
  { inForcePeriod: 'month', budgetID: 'search-day', periodStart: '2026-10-16', kind: 'day' },
  { inForcePeriod: 'week', budgetID: 'search-day', periodStart: '2026-10-16', kind: 'day' },
] as const)(
  'it picks the $kind kind for the start $periodStart of $budgetID with the period $inForcePeriod in force',
  (row) => {
    expect(pickLedgerPeriodKind(row.inForcePeriod, row.budgetID, row.periodStart)).toBe(row.kind);
  },
);
