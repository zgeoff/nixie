import type { SpendStopRow } from '../stop/read-spend-stop-row';

// The row of a day trip by turns that was reached at 16:42 UTC on 13 Nov 2026.
export function buildSpendStopRow(overrides: Partial<SpendStopRow> = {}): SpendStopRow {
  return {
    reason: 'limit',
    period: 'day',
    measure: 'turns',
    resetsAt: Date.parse('2026-11-14T00:00:00Z'),
    at: Date.parse('2026-11-13T16:42:07Z'),
    limit: 1000,
    spent: 1000,
    ...overrides,
  };
}
