import type { RouteLimitsByID } from '../periods/collect-trips';
import { isDollarLimitReached } from '../periods/is-dollar-limit-reached';
import { pickRouteLimit } from '../periods/pick-route-limit';
import type { Overrides, PeriodName, PeriodStore, PeriodsConfig } from '../types';

interface PeriodStatus {
  readonly start: string;
  readonly resetsAt: string;
  readonly dollars: number;

  // the limit in force in US dollars, null on a route with none
  readonly limit: number | null;

  // the most a raise of the day reaches, null on the month and on a route with no limit
  readonly cap: number | null;
  readonly tripped: boolean;

  // the instant the count first reached the limit, null while it is under
  readonly sinceMs: number | null;
}

interface RouteStatus {
  readonly day: PeriodStatus;
  readonly month: PeriodStatus;
}

export interface GatewayStatus {
  readonly zone: string;
  readonly lost: boolean;
  readonly routes: Readonly<Record<string, RouteStatus>>;
}

// Each route's day and month, with the limit in force. A period's `sinceMs` is the instant the
// store first saw it at its limit.
export function buildStatus(
  store: PeriodStore,
  limits: RouteLimitsByID,
  overrides: Overrides,
  config: PeriodsConfig,
): GatewayStatus {
  const buildPeriod = (route: string, name: PeriodName): PeriodStatus => {
    const count = Object.hasOwn(store.routes, route) ? store.routes[route]?.[name] : undefined;

    if (count === undefined) {
      throw new Error(`the store holds no count for the route ${route}`);
    }

    const limit = pickRouteLimit({ store, limits, overrides, route, period: name });
    const configured = Object.hasOwn(limits, route) ? limits[route] : null;
    const isTripped = limit !== null && isDollarLimitReached(count.dollars, limit);

    return {
      start: count.start,
      resetsAt: formatInstant(Date.parse(count.resetsAt)),
      dollars: count.dollars,
      limit,
      cap: name === 'day' ? (configured?.dayCap ?? null) : null,
      tripped: isTripped,

      // the override file can change between the store's stamp and this read
      sinceMs: isTripped && count.trippedAt !== null ? Date.parse(count.trippedAt) : null,
    };
  };

  return {
    zone: config.zone,
    lost: store.lost,
    routes: Object.fromEntries(
      Object.keys(store.routes).map((route) => [
        route,
        { day: buildPeriod(route, 'day'), month: buildPeriod(route, 'month') },
      ]),
    ),
  };
}

function formatInstant(instantMs: number): string {
  return new Date(instantMs).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}
