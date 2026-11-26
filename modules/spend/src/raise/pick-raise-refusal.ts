import type { GatewayStatus, SpendTurnLimits } from '../types';

// What a raise asks for, for the day in force: a route's or a provider's dollars, the turns, or
// both. A raise lifts each limit it names to a total, never by an amount.
export interface RaiseRequest {
  readonly start: string;
  readonly route?: string;
  readonly provider?: string;
  readonly dollars?: number;
  readonly turns?: number;
}

export type RaiseRefusal =
  | {
      readonly error: 'above_cap';
      readonly measure: 'dollars' | 'turns';
      readonly route: string | null;
      readonly provider: string | null;
      readonly cap: number;
    }
  | { readonly error: 'period_ended' }
  | { readonly error: 'unknown_route' }
  | { readonly error: 'unknown_provider' }
  | { readonly error: 'no_route_limit'; readonly route: string };

// A raise is for the day in force, and its totals stay under the day's caps. A route with no limit
// of its own takes no raise, because its provider's limits bind it. A refused raise writes nothing.
export function pickRaiseRefusal(
  status: GatewayStatus,
  limits: SpendTurnLimits,
  request: RaiseRequest,
): RaiseRefusal | null {
  const dollarsRefusal = pickDollarsRefusal(status, request);

  if (dollarsRefusal !== null) {
    return dollarsRefusal;
  }

  if ((request.turns ?? 0) > limits.dayTurnCap) {
    return {
      error: 'above_cap',
      measure: 'turns',
      route: null,
      provider: null,
      cap: limits.dayTurnCap,
    };
  }

  return null;
}

function pickDollarsRefusal(status: GatewayStatus, request: RaiseRequest): RaiseRefusal | null {
  if (request.route !== undefined) {
    const routes = status.routes;
    const day = Object.hasOwn(routes, request.route) ? routes[request.route]?.day : undefined;

    if (day === undefined) {
      return { error: 'unknown_route' };
    }

    if (request.start !== day.start) {
      return { error: 'period_ended' };
    }

    if (day.limit === null) {
      return { error: 'no_route_limit', route: request.route };
    }

    if (day.cap !== null && (request.dollars ?? 0) > day.cap) {
      return {
        error: 'above_cap',
        measure: 'dollars',
        route: request.route,
        provider: null,
        cap: day.cap,
      };
    }
  }

  if (request.provider !== undefined) {
    const providers = status.providers;

    const day = Object.hasOwn(providers, request.provider)
      ? providers[request.provider]?.day
      : undefined;

    if (day === undefined) {
      return { error: 'unknown_provider' };
    }

    if (request.start !== day.start) {
      return { error: 'period_ended' };
    }

    if (day.cap !== null && (request.dollars ?? 0) > day.cap) {
      return {
        error: 'above_cap',
        measure: 'dollars',
        route: null,
        provider: request.provider,
        cap: day.cap,
      };
    }
  }

  return null;
}
