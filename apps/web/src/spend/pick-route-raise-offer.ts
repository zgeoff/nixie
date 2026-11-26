import type { SpendRouteTrip } from '../types';

export interface RouteRaiseOffer {
  readonly dollars: number;
}

// "Raise the day limit of a route" offers the route's day limit plus half, up to the route's cap,
// in whole cents. A raise above the cap is refused.
export function pickRouteRaiseOffer(trip: SpendRouteTrip): RouteRaiseOffer {
  const cap = trip.cap ?? trip.limit;

  return { dollars: Math.min(cap, Math.round(trip.limit * 150) / 100) };
}
