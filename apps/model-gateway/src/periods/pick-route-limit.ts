import type { Overrides, PeriodName, PeriodStore, RouteCount, RouteLimits } from '../types';
import type { LimitTable } from './limit-table';
import { pickDayLimit } from './pick-day-limit';

export interface PeriodLimitAsk {
  readonly store: PeriodStore;
  readonly limits: LimitTable;
  readonly overrides: Overrides;
  readonly id: string;
  readonly period: PeriodName;
}

// The limit in force of a route's period, or null for a route with no limit of its own
export function pickRouteLimit(ask: PeriodLimitAsk): number | null {
  const configured = Object.hasOwn(ask.limits.routes, ask.id) ? ask.limits.routes[ask.id] : null;

  const count = Object.hasOwn(ask.store.routes, ask.id)
    ? ask.store.routes[ask.id]?.[ask.period]
    : undefined;

  const override = Object.hasOwn(ask.overrides.routes, ask.id)
    ? ask.overrides.routes[ask.id]
    : undefined;

  return pickLimit(configured, count, override, ask.period);
}

// The limit in force of a provider's period, or null for a provider the config lacks
export function pickProviderLimit(ask: PeriodLimitAsk): number | null {
  const configured = Object.hasOwn(ask.limits.providers, ask.id)
    ? ask.limits.providers[ask.id]
    : null;

  const count = Object.hasOwn(ask.store.providers, ask.id)
    ? ask.store.providers[ask.id]?.[ask.period]
    : undefined;

  const override = Object.hasOwn(ask.overrides.providers, ask.id)
    ? ask.overrides.providers[ask.id]
    : undefined;

  return pickLimit(configured, count, override, ask.period);
}

function pickLimit(
  configured: RouteLimits | null | undefined,
  count: RouteCount | undefined,
  override: Overrides['routes'][string] | undefined,
  period: PeriodName,
): number | null {
  if (configured === null || configured === undefined || count === undefined) {
    return null;
  }

  return period === 'month' ? configured.month : pickDayLimit(configured, count, override);
}
