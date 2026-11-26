import type { SpendStop } from '../types';

type TrippedStop = Extract<SpendStop, { readonly state: 'tripped' }>;

// A day trip by turns that matches the row of buildSpendStopRow.
export function buildTrippedStop(overrides: Partial<TrippedStop> = {}): TrippedStop {
  return {
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    measure: 'turns',
    limit: 1000,
    spent: 1000,
    at: Date.parse('2026-11-13T16:42:07Z'),
    resetsAt: Date.parse('2026-11-14T00:00:00Z'),
    canRaise: true,
    cap: 2000,
    ...overrides,
  };
}
