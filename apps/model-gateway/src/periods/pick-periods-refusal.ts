import type { Overrides, PeriodStore, RefusalCounter } from '../types';
import type { RouteLimitsByID } from './collect-trips';
import { pickRouteLimit } from './pick-route-limit';

export type PeriodsRefusal =
  | {
      readonly kind: 'unavailable';
      readonly status: 503;
      readonly type: 'api_error';
      readonly message: string;
    }
  | {
      readonly kind: 'denied';
      readonly status: 403;
      readonly type: 'permission_error';
      readonly message: string;
    }
  | {
      readonly kind: 'limit_reached';
      readonly status: 403;
      readonly type: 'limit_reached';
      readonly counter: RefusalCounter;
      readonly route: string;
      readonly message: string;
    };

export interface RefusalAsk {
  readonly store: PeriodStore;
  readonly limits: RouteLimitsByID;
  readonly overrides: Overrides;
  readonly route: string;
  readonly sandbox: string | null;
  readonly countBySandbox: boolean;
}

// What stops a request, or null when it may pass. The lost mark and a route with no limit answer
// 503; a limit that a count has reached answers 403 with the counter and the route. No message
// holds a dollar figure.
export function pickPeriodsRefusal(ask: RefusalAsk): PeriodsRefusal | null {
  if (ask.store.lost) {
    return {
      kind: 'unavailable',
      status: 503,
      type: 'api_error',
      message:
        'the model gateway lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
    };
  }

  const day = pickRouteLimit({ ...ask, period: 'day' });
  const month = pickRouteLimit({ ...ask, period: 'month' });

  if (day === null || month === null) {
    return {
      kind: 'unavailable',
      status: 503,
      type: 'api_error',
      message: `the model gateway holds no limit for the route ${ask.route}, so it refuses every request on it`,
    };
  }

  const held =
    ask.sandbox !== null && Object.hasOwn(ask.store.sandboxes, ask.sandbox)
      ? ask.store.sandboxes[ask.sandbox]
      : undefined;

  if (ask.countBySandbox && held === undefined) {
    return {
      kind: 'denied',
      status: 403,
      type: 'permission_error',
      message:
        'the model gateway counts by sandbox and holds no entry for this one, so it refuses the request',
    };
  }

  const periods = Object.hasOwn(ask.store.routes, ask.route)
    ? ask.store.routes[ask.route]
    : undefined;

  const reached = (
    [
      ['route_day', day, periods?.day.dollars],
      ['route_month', month, periods?.month.dollars],
    ] as const
  ).find(([, limit, spent]) => spent !== undefined && spent >= limit);

  if (reached !== undefined) {
    const period = reached[0] === 'route_day' ? 'day' : 'month';

    return {
      kind: 'limit_reached',
      status: 403,
      type: 'limit_reached',
      counter: reached[0],
      route: ask.route,
      message: `the model gateway reached the ${period} limit of the route ${ask.route}, so it refuses every further request on it until the ${period} resets`,
    };
  }

  if (
    held?.limit !== undefined &&
    held.limit !== null &&
    (held.dollars >= held.limit.dollars || held.tokens >= held.limit.tokens)
  ) {
    return {
      kind: 'limit_reached',
      status: 403,
      type: 'limit_reached',
      counter: 'sandbox',
      route: ask.route,
      message:
        "the model gateway reached this sandbox's limit, so it refuses every further request",
    };
  }

  return null;
}
