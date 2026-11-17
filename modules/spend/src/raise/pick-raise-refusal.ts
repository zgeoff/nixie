import type { PeriodStatus, SpendTriple, SpendTurnLimits } from '../types';

export interface RaiseRequest {
  readonly start: string;
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
}

export type RaiseRefusal =
  | { readonly error: 'above_cap'; readonly cap: SpendTriple }
  | { readonly error: 'period_ended' };

// A raise is for the day in force, and its totals stay under the day's caps: the gateway's for the
// dollars and the tokens, and the config's turn cap for the turns. A refused raise writes nothing.
export function pickRaiseRefusal(
  day: PeriodStatus,
  limits: SpendTurnLimits,
  request: RaiseRequest,
): RaiseRefusal | null {
  if (request.start !== day.start) {
    return { error: 'period_ended' };
  }

  const isAbove =
    request.dollars > day.cap.dollars ||
    request.tokens > day.cap.tokens ||
    request.turns > limits.dayTurnCap;

  return isAbove
    ? {
        error: 'above_cap',
        cap: { dollars: day.cap.dollars, tokens: day.cap.tokens, turns: limits.dayTurnCap },
      }
    : null;
}
