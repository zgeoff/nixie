import type { GatewayStatus, PeriodName, RouteTrip } from '../types';

// Every route that has reached a limit in force, with the period that holds it: the day when both
// are reached, because only the day can be raised.
export function collectRouteTrips(status: GatewayStatus, nowMs: number): RouteTrip[] {
  const trips: RouteTrip[] = [];

  for (const [route, periods] of Object.entries(status.routes)) {
    const reached = (['day', 'month'] as const).find((name) => periods[name].tripped);

    if (reached === undefined) {
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
