import type { SpendProviderTrip, SpendRouteTrip } from '../types';

export interface RouteRaiseOffer {
  readonly dollars: number;
}

// "Raise the day limit of" a route or a provider offers its day limit plus half, up to its cap, in
// whole cents. A raise above the cap is refused.
export function pickRouteRaiseOffer(
  trip: Pick<SpendRouteTrip | SpendProviderTrip, 'cap' | 'limit'>,
): RouteRaiseOffer {
  const cap = trip.cap ?? trip.limit;

  return { dollars: Math.min(cap, Math.round(trip.limit * 150) / 100) };
}
