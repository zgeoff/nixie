import type { SpendFacts } from '../stop/pick-spend-stop';
import { buildMockGatewayStatus } from './build-stub-spend-gateway';

// Facts at 16:42 UTC on 13 Nov 2026, with an answering gateway, no turns and no raise, under the
// default turn limits of 1000 a day, a cap of 2000 and 20000 a month.
export function buildSpendFacts(overrides: Partial<SpendFacts> = {}): SpendFacts {
  return {
    status: buildMockGatewayStatus(),
    turns: { day: 0, month: 0 },
    raise: null,
    limits: { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 },
    now: Date.parse('2026-11-13T16:42:07Z'),
    ...overrides,
  };
}
