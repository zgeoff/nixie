import type { TripPayload } from '../stop/pick-spend-move';
import type { SpendRaise } from '../stop/read-spend-raise';
import type { SpendTurns } from '../stop/read-spend-turns';
import type { SpendPeriodStart } from '../time/build-spend-periods';
import type { PeriodName, SpendTurnLimits } from '../types';

export interface TurnTripFacts {
  readonly turns: SpendTurns;
  readonly raise: SpendRaise | null;
  readonly limits: SpendTurnLimits;
  readonly periods: Readonly<Record<PeriodName, SpendPeriodStart>>;
  readonly now: number;
}

// The trip of the first period whose turn count has reached its limit, the day before the month, or
// null under both. The day's limit is the config's, or the raise's turns when those are more.
export function pickTurnTrip(facts: TurnTripFacts): TripPayload | null {
  const dayLimit = Math.max(facts.limits.dayTurns, facts.raise?.turns ?? 0);

  if (facts.turns.day >= dayLimit) {
    return buildTurnTrip(facts, 'day', { limit: dayLimit, spent: facts.turns.day });
  }

  if (facts.turns.month >= facts.limits.monthTurns) {
    return buildTurnTrip(facts, 'month', {
      limit: facts.limits.monthTurns,
      spent: facts.turns.month,
    });
  }

  return null;
}

interface TurnCount {
  readonly limit: number;
  readonly spent: number;
}

function buildTurnTrip(facts: TurnTripFacts, period: PeriodName, count: TurnCount): TripPayload {
  return {
    reason: 'limit',
    at: facts.now,
    period,
    measure: 'turns',
    limit: count.limit,
    spent: count.spent,
    resetsAt: facts.periods[period].resetsAtMs,
  };
}
