import type { GatewayStatus, PeriodName, RouteTrip } from '../types';
import { pickReachedPeriod } from './pick-reached-period';

// Every route that has reached a limit of its own in force, with the period that holds it. A route
// with no limit of its own never trips, and its provider's trip is a stop of its own.
export function collectRouteTrips(status: GatewayStatus, nowMs: number): RouteTrip[] {
  const trips: RouteTrip[] = [];

  for (const [route, periods] of Object.entries(status.routes)) {
    const reached = pickReachedPeriod(periods, nowMs);

    if (reached === null) {
      continue;
    }

    trips.push(buildRouteTrip(route, reached, periods[reached], nowMs));
  }

  return trips;
}

function buildRouteTrip(
  route: string,
  period: PeriodName,
  count: GatewayStatus['routes'][string]['day'],
  nowMs: number,
): RouteTrip {
  return {
    route,
    period,
    start: count.start,
    limit: count.limit ?? 0,
    spent: count.dollars,
    at: count.sinceMs ?? nowMs,
    resetsAt: Date.parse(count.resetsAt),
    canRaise: period === 'day' && count.cap !== null && (count.limit ?? 0) < count.cap,
    cap: count.cap,
  };
}
