import type { Overrides, PeriodName, PeriodStore } from '../types';
import type { RouteLimitsByID } from './collect-trips';
import { pickDayLimit } from './pick-day-limit';

export interface RouteLimitAsk {
  readonly store: PeriodStore;
  readonly limits: RouteLimitsByID;
  readonly overrides: Overrides;
  readonly route: string;
  readonly period: PeriodName;
}

// The limit in force of a route's period, or null for a route with no limit
export function pickRouteLimit(ask: RouteLimitAsk): number | null {
  const configured = Object.hasOwn(ask.limits, ask.route) ? ask.limits[ask.route] : null;

  const count = Object.hasOwn(ask.store.routes, ask.route)
    ? ask.store.routes[ask.route]?.[ask.period]
    : undefined;

  if (configured === null || configured === undefined || count === undefined) {
    return null;
  }

  if (ask.period === 'month') {
    return configured.month;
  }

  const override = Object.hasOwn(ask.overrides, ask.route) ? ask.overrides[ask.route] : undefined;

  return pickDayLimit(configured, count, override);
}
