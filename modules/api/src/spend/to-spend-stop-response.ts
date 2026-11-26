import type { SpendStop, SpendTrips } from '@heynixie/spend';

export function toSpendStopResponse(stop: SpendStop, trips: SpendTrips) {
  const routes = trips.routes.map((trip) => ({
    ...trip,
    at: new Date(trip.at),
    resetsAt: new Date(trip.resetsAt),
  }));

  const providers = trips.providers.map((trip) => ({
    ...trip,
    routes: [...trip.routes],
    at: new Date(trip.at),
    resetsAt: new Date(trip.resetsAt),
  }));

  if (stop.state !== 'tripped') {
    return { ...stop, routes, providers };
  }

  return {
    ...stop,
    at: new Date(stop.at),
    resetsAt: new Date(stop.resetsAt),
    routes,
    providers,
  };
}
