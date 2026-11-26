import type { LimitTable } from '../periods/limit-table';
import type { PeriodChange, PeriodStore, RoutePeriods } from '../types';
import type { ControlOutcome } from './control-outcome';
import type { LimitTarget } from './types';

export interface DayRaise {
  readonly target: LimitTarget;
  readonly start: string;
  readonly dollars: number;
}

// Raises a route's or a provider's day limit for the day in force, never below an earlier raise of
// that day, and refuses without a change past the cap, for a day that has ended, for a target the
// config lacks, and for a route with no limit of its own.
export function pickRaiseChange(
  store: PeriodStore,
  limits: LimitTable,
  raise: DayRaise,
): PeriodChange<ControlOutcome> {
  const id = raise.target.id;
  const isProvider = raise.target.kind === 'provider';
  const heldLimits = isProvider ? limits.providers : limits.routes;
  const held = isProvider ? store.providers : store.routes;
  const configured = Object.hasOwn(heldLimits, id) ? heldLimits[id] : undefined;
  const periods = Object.hasOwn(held, id) ? held[id] : undefined;

  if (configured === undefined || periods === undefined) {
    return { store: null, result: { kind: isProvider ? 'unknown_provider' : 'unknown_route' } };
  }

  if (configured === null) {
    return { store: null, result: { kind: 'no_route_limit', route: id } };
  }

  if (raise.dollars > configured.dayCap) {
    return {
      store: null,
      result: {
        kind: 'above_cap',
        route: isProvider ? null : id,
        provider: isProvider ? id : null,
        cap: configured.dayCap,
      },
    };
  }

  if (raise.start !== periods.day.start) {
    return { store: null, result: { kind: 'period_ended' } };
  }

  // Two raises of one day can arrive in either order, so the day keeps the larger.
  const earlier = periods.day.raise;
  const dollars = earlier === null ? raise.dollars : Math.max(earlier, raise.dollars);
  const raised: RoutePeriods = { ...periods, day: { ...periods.day, raise: dollars } };

  return {
    store: isProvider
      ? { ...store, providers: { ...store.providers, [id]: raised } }
      : { ...store, routes: { ...store.routes, [id]: raised } },
    result: { kind: 'done' },
  };
}
