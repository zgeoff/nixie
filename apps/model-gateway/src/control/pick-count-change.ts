import type { LimitTable } from '../periods/limit-table';
import { toMicros } from '../periods/to-micros';
import type { PeriodChange, PeriodName, PeriodStore, RoutePeriods } from '../types';
import type { ControlOutcome } from './control-outcome';
import type { LimitTarget } from './types';

export interface CountSet {
  readonly target: LimitTarget;
  readonly period: PeriodName;
  readonly start: string;
  readonly dollars: number;
}

// Sets one period's count of a route or a provider to the dollars given, and changes no limit. It
// answers the micros the period held, so the caller can record what it replaced. Refuses without a
// change for a target the config lacks and for a period that has ended.
export function pickCountChange(
  store: PeriodStore,
  limits: LimitTable,
  change: CountSet,
): PeriodChange<ControlOutcome> {
  const id = change.target.id;
  const isProvider = change.target.kind === 'provider';
  const heldLimits = isProvider ? limits.providers : limits.routes;
  const held = isProvider ? store.providers : store.routes;
  const periods = Object.hasOwn(held, id) ? held[id] : undefined;

  if (!Object.hasOwn(heldLimits, id) || periods === undefined) {
    return { store: null, result: { kind: isProvider ? 'unknown_provider' : 'unknown_route' } };
  }

  if (change.start !== periods[change.period].start) {
    return { store: null, result: { kind: 'period_ended' } };
  }

  const set: RoutePeriods = {
    ...periods,
    [change.period]: { ...periods[change.period], micros: toMicros(change.dollars) },
  };

  return {
    store: isProvider
      ? { ...store, providers: { ...store.providers, [id]: set } }
      : { ...store, routes: { ...store.routes, [id]: set } },
    result: { kind: 'replaced', replacedMicros: periods[change.period].micros },
  };
}
