import type { SpendStop } from '../types';

type SpendTrip = Extract<SpendStop, { readonly state: 'tripped' }>;

export function buildMockSpendTrip(overrides: Partial<SpendTrip> = {}): SpendTrip {
  return {
    state: 'tripped',
    period: 'day',
    start: '2026-11-13',
    measure: 'turns',
    limit: 1000,
    spent: 1000,
    at: new Date('2026-11-13T16:42:07Z'),
    resetsAt: new Date('2026-11-14T00:00:00Z'),
    canRaise: true,
    cap: 2000,
    routes: [],
    providers: [],
    ...overrides,
  };
}
