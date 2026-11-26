import { pickLimit } from './pick-limit';
import type { PeriodLimitAsk } from './types';

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
