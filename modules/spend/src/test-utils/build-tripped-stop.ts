import type { SpendStop } from '../types';

type TrippedStop = Extract<SpendStop, { readonly state: 'tripped' }>;

// A day trip by dollars that matches the row of buildSpendStopRow.
export function buildTrippedStop(overrides: Partial<TrippedStop> = {}): TrippedStop {
  return {
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    measure: 'dollars',
    limit: 60,
    spent: 61.2,
    at: Date.parse('2026-11-13T16:42:07Z'),
    resetsAt: Date.parse('2026-11-14T00:00:00Z'),
    canRaise: true,
    limits: { dollars: 60, tokens: 80_000_000, turns: 1000 },
    used: { dollars: 61.2, tokens: 51_200_000, turns: 40 },
    cap: { dollars: 120, tokens: 160_000_000, turns: 2000 },
    ...overrides,
  };
}
