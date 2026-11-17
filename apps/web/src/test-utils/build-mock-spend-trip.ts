import type { SpendStop } from '../types';

type SpendTrip = Extract<SpendStop, { readonly state: 'tripped' }>;

export function buildMockSpendTrip(overrides: Partial<SpendTrip> = {}): SpendTrip {
  return {
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    measure: 'dollars',
    limit: 60,
    spent: 61.2,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-11-14T00:00:00Z'),
    canRaise: true,
    limits: { dollars: 60, tokens: 80_000_000, turns: 1000 },
    used: { dollars: 61.2, tokens: 5, turns: 5 },
    cap: { dollars: 120, tokens: 160_000_000, turns: 2000 },
    ...overrides,
  };
}
