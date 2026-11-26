import type { SpendTrip } from '../types';

export interface RaiseOffer {
  readonly turns: number;
}

// "Raise today's limit" offers today's turn limit plus half, up to the cap. A raise above the cap is
// refused, and a raise never lowers a total that the host set above it.
export function pickRaiseOffer(stop: SpendTrip): RaiseOffer {
  return { turns: Math.min(stop.cap, Math.round(stop.limit * 1.5)) };
}
