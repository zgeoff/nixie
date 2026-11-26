import type { SpendPeriodStart } from '../time/build-spend-periods';
import type { GatewayStatus, PeriodName, SpendStop, SpendTurnLimits } from '../types';
import type { SpendRaise } from './read-spend-raise';
import type { SpendTurns } from './read-spend-turns';

export interface SpendFacts {
  // null when the gateway did not answer
  readonly status: GatewayStatus | null;
  readonly turns: SpendTurns;

  // the raise of today's turns
  readonly raise: SpendRaise | null;

  // each route's raise of today's dollars, by route ID
  readonly routeRaises: Readonly<Record<string, number>>;
  readonly limits: SpendTurnLimits;
  readonly now: number;

  // the instant before the read that the status came from, so a period that ended after it still
  // counts for the status
  readonly statusAtMs: number;

  // the place of these facts among the facts that were read, which a settle checks for staleness
  readonly order: number;
  readonly periods: Readonly<Record<PeriodName, SpendPeriodStart>>;
}

// What the stop for the whole of nixie is: the gateway does not answer, the lost mark, or a turn
// limit that the count reached. A turn limit is a total: a raise sets it to the raise's turns when
// those pass the config. A route at its dollar limit is no part of it, as the route trips say.
export function pickSpendStop(facts: SpendFacts): SpendStop {
  const status = facts.status;

  if (status === null) {
    return { state: 'unreachable' };
  }

  if (status.lost) {
    return { state: 'lost' };
  }

  const dayLimit = Math.max(facts.limits.dayTurns, facts.raise?.turns ?? 0);

  if (facts.turns.day >= dayLimit) {
    return buildTrip(facts, 'day', dayLimit, facts.turns.day);
  }

  if (facts.turns.month >= facts.limits.monthTurns) {
    return buildTrip(facts, 'month', facts.limits.monthTurns, facts.turns.month);
  }

  return { state: 'clear' };
}

function buildTrip(
  facts: SpendFacts,
  period: PeriodName,
  limit: number,
  spent: number,
): Extract<SpendStop, { readonly state: 'tripped' }> {
  const isDay = period === 'day';

  return {
    state: 'tripped',
    period,
    start: facts.periods[period].start,
    measure: 'turns',
    limit,
    spent,
    at: facts.now,
    resetsAt: facts.periods[period].resetsAtMs,
    canRaise: isDay && limit < facts.limits.dayTurnCap,
    cap: isDay ? facts.limits.dayTurnCap : facts.limits.monthTurns,
  };
}
