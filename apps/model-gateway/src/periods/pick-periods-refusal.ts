import type { Overrides, PeriodStore, RefusalCounter } from '../types';
import { isLimitReached } from './is-limit-reached';
import { isSandboxLimitReached } from './is-sandbox-limit-reached';
import type { LimitTable } from './limit-table';
import { pickProviderLimit, pickRouteLimit } from './pick-route-limit';

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
      readonly provider: string;
      readonly message: string;
    };

export interface RefusalAsk {
  readonly store: PeriodStore;
  readonly limits: LimitTable;
  readonly overrides: Overrides;
  readonly route: string;
  readonly sandbox: string | null;
  readonly countBySandbox: boolean;
}

// What stops a request, or null when it may pass. The checks run in this order: the lost mark, a
// sandbox the store lacks, the route's limits, the provider's limits, then the sandbox's own limit.
// No message holds a dollar figure.
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

  const provider = ask.limits.providerOf[ask.route] ?? '';

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

  const reached = findReachedLimit(ask, provider);

  if (reached !== null) {
    return {
      kind: 'limit_reached',
      status: 403,
      type: 'limit_reached',
      counter: reached.counter,
      route: ask.route,
      provider,
      message:
        reached.scope === 'route'
          ? `the model gateway reached the ${reached.period} limit of the route ${ask.route}, so it refuses every further request on it until the ${reached.period} resets`
          : `the model gateway reached the ${reached.period} limit of the provider ${provider}, so it refuses every further request on every route of it until the ${reached.period} resets`,
    };
  }

  if (held !== undefined && isSandboxLimitReached(held)) {
    return {
      kind: 'limit_reached',
      status: 403,
      type: 'limit_reached',
      counter: 'sandbox',
      route: ask.route,
      provider,
      message:
        "the model gateway reached this sandbox's limit, so it refuses every further request",
    };
  }

  return null;
}

interface ReachedLimit {
  readonly scope: 'route' | 'provider';
  readonly period: 'day' | 'month';
  readonly counter: RefusalCounter;
}

const routeCounters = { day: 'route_day', month: 'route_month' } as const;
const providerCounters = { day: 'provider_day', month: 'provider_month' } as const;

// the first limit at its count, a route's before its provider's and a day before its month
function findReachedLimit(ask: RefusalAsk, provider: string): ReachedLimit | null {
  const scopes = [
    { scope: 'route', id: ask.route, held: ask.store.routes },
    { scope: 'provider', id: provider, held: ask.store.providers },
  ] as const;

  for (const entry of scopes) {
    const scope = entry.scope;
    const id = entry.id;
    const held = entry.held;
    const periods = Object.hasOwn(held, id) ? held[id] : undefined;

    for (const period of ['day', 'month'] as const) {
      const limitAsk = {
        store: ask.store,
        limits: ask.limits,
        overrides: ask.overrides,
        id,
        period,
      };

      const limit = scope === 'route' ? pickRouteLimit(limitAsk) : pickProviderLimit(limitAsk);
      const spent = periods?.[period].micros;

      if (limit !== null && spent !== undefined && isLimitReached(spent, limit)) {
        const counter = scope === 'route' ? routeCounters[period] : providerCounters[period];

        return { scope, period, counter };
      }
    }
  }

  return null;
}
