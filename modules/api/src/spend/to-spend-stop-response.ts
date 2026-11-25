import type { RouteTrip, SpendStop } from '@heynixie/spend';

export function toSpendStopResponse(stop: SpendStop, routes: readonly RouteTrip[]) {
  const dated = routes.map((trip) => ({
    ...trip,
    at: new Date(trip.at),
    resetsAt: new Date(trip.resetsAt),
  }));

  if (stop.state !== 'tripped') {
    return { ...stop, routes: dated };
  }

  return { ...stop, at: new Date(stop.at), resetsAt: new Date(stop.resetsAt), routes: dated };
}
