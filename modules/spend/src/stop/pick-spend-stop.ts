import type {
  GatewayStatus,
  PeriodName,
  SpendMeasure,
  SpendStop,
  SpendTriple,
  SpendTurnLimits,
} from '../types';
import type { SpendRaise } from './read-spend-raise';
import type { SpendTurns } from './read-spend-turns';

export interface SpendFacts {
  // null when the gateway did not answer
  readonly status: GatewayStatus | null;
  readonly turns: SpendTurns;

  // the raise of today, whose totals hold the limits that it set
  readonly raise: SpendRaise | null;
  readonly limits: SpendTurnLimits;
  readonly now: number;
}

// What the stop is: the lost mark, a trip that the gateway reports, or a turn limit that the count
// reached. A turn limit is a total: a raise sets it to the raise's turns when those pass the config.
export function pickSpendStop(facts: SpendFacts): SpendStop {
  const status = facts.status;

  if (status === null) {
    return { state: 'unreachable' };
  }

  if (status.lost || (status.tripped !== null && 'lost' in status.tripped)) {
    return { state: 'lost' };
  }

  if (status.tripped !== null) {
    const trip = status.tripped;
    const view = buildPeriodView(facts, status, trip.period);

    return buildTrip(view, trip.period, trip.measure, Date.parse(trip.at));
  }

  for (const period of ['day', 'month'] as const) {
    const view = buildPeriodView(facts, status, period);

    if (view.used.turns >= view.limits.turns) {
      return buildTrip(view, period, 'turns', facts.now);
    }
  }

  return { state: 'clear' };
}

// The limits in force, the counts and the caps of one period, in the 3 measures.
interface PeriodView {
  readonly limits: SpendTriple;
  readonly used: SpendTriple;
  readonly cap: SpendTriple;
  readonly resetsAt: number;
  readonly start: string;
}

function buildPeriodView(facts: SpendFacts, status: GatewayStatus, period: PeriodName): PeriodView {
  const gateway = status.periods[period];
  const isDay = period === 'day';

  const turnLimit = isDay
    ? Math.max(facts.limits.dayTurns, facts.raise?.turns ?? 0)
    : facts.limits.monthTurns;

  return {
    limits: {
      dollars: gateway.limit?.dollars ?? 0,
      tokens: gateway.limit?.tokens ?? 0,
      turns: turnLimit,
    },
    used: {
      dollars: gateway.spent.dollars,
      tokens: gateway.spent.tokens,
      turns: isDay ? facts.turns.day : facts.turns.month,
    },
    cap: {
      dollars: gateway.cap.dollars,
      tokens: gateway.cap.tokens,
      turns: isDay ? facts.limits.dayTurnCap : facts.limits.monthTurns,
    },
    resetsAt: Date.parse(gateway.resetsAt),
    start: gateway.start,
  };
}

type TrippedStop = Extract<SpendStop, { readonly state: 'tripped' }>;

function buildTrip(
  view: PeriodView,
  period: PeriodName,
  measure: SpendMeasure,
  at: number,
): TrippedStop {
  return {
    state: 'tripped',
    period,
    start: view.start,
    measure,
    limit: view.limits[measure],
    spent: view.used[measure],
    at,
    resetsAt: view.resetsAt,
    canRaise: period === 'day' && canRaiseEach(view, measure),
    limits: view.limits,
    used: view.used,
    cap: view.cap,
  };
}

const measures: readonly SpendMeasure[] = ['dollars', 'tokens', 'turns'];

// A raise lifts every tripped measure, so each one needs room below its cap.
function canRaiseEach(view: PeriodView, reported: SpendMeasure): boolean {
  return measures
    .filter((measure) => measure === reported || view.used[measure] >= view.limits[measure])
    .every((measure) => view.limits[measure] < view.cap[measure]);
}
