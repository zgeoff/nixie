import type { PeriodChange, PeriodStore, RouteLimits } from '../types';
import type { ControlOutcome } from './control-outcome';

export interface DayRaise {
  readonly route: string;
  readonly start: string;
  readonly dollars: number;
}

// Raises a route's day limit for the day in force, never below an earlier raise of that day, and
// refuses without a change past the route's cap, for a day that has ended, or for a route that has
// no limit or no count.
export function pickRaiseChange(
  store: PeriodStore,
  limits: RouteLimits | null,
  raise: DayRaise,
): PeriodChange<ControlOutcome> {
  const periods = Object.hasOwn(store.routes, raise.route) ? store.routes[raise.route] : undefined;

  if (limits === null || periods === undefined) {
    return { store: null, result: { kind: 'unknown_route' } };
  }

  if (raise.dollars > limits.dayCap) {
    return { store: null, result: { kind: 'above_cap', route: raise.route, cap: limits.dayCap } };
  }

  if (raise.start !== periods.day.start) {
    return { store: null, result: { kind: 'period_ended' } };
  }

  // Two raises of one day can arrive in either order, so the day keeps the larger.
  const earlier = periods.day.raise;
  const dollars = earlier === null ? raise.dollars : Math.max(earlier, raise.dollars);

  return {
    store: {
      ...store,
      routes: {
        ...store.routes,
        [raise.route]: { ...periods, day: { ...periods.day, raise: dollars } },
      },
    },
    result: { kind: 'done' },
  };
}
