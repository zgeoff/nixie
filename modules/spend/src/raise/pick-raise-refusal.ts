import type { GatewayStatus, SpendTurnLimits } from '../types';

// What a raise asks for, for the day in force: a route's dollars, the turns, or both. A raise lifts
// each limit it names to a total, never by an amount.
export interface RaiseRequest {
  readonly start: string;
  readonly route?: string;
  readonly dollars?: number;
  readonly turns?: number;
}

export type RaiseRefusal =
  | {
      readonly error: 'above_cap';
      readonly measure: 'dollars' | 'turns';
      readonly route: string | null;
      readonly cap: number;
    }
  | { readonly error: 'period_ended' }
  | { readonly error: 'unknown_route' };

// A raise is for the day in force, and its totals stay under the day's caps: the gateway's for a
// route's dollars, and the config's turn cap for the turns. A refused raise writes nothing.
export function pickRaiseRefusal(
  status: GatewayStatus,
  limits: SpendTurnLimits,
  request: RaiseRequest,
): RaiseRefusal | null {
  if (request.route !== undefined) {
    const routes = status.routes;
    const day = Object.hasOwn(routes, request.route) ? routes[request.route]?.day : undefined;

    if (day === undefined) {
      return { error: 'unknown_route' };
    }

    if (request.start !== day.start) {
      return { error: 'period_ended' };
    }

    if (day.cap !== null && (request.dollars ?? 0) > day.cap) {
      return { error: 'above_cap', measure: 'dollars', route: request.route, cap: day.cap };
    }
  }

  if ((request.turns ?? 0) > limits.dayTurnCap) {
    return { error: 'above_cap', measure: 'turns', route: null, cap: limits.dayTurnCap };
  }

  return null;
}
