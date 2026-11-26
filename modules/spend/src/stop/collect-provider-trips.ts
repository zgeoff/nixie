import type { GatewayStatus, PeriodName, ProviderTrip } from '../types';
import { pickReachedPeriod } from './pick-reached-period';

// Every provider that has reached a limit in force, with the period that holds it and the routes it
// stops
export function collectProviderTrips(status: GatewayStatus, nowMs: number): ProviderTrip[] {
  const trips: ProviderTrip[] = [];

  for (const [provider, periods] of Object.entries(status.providers)) {
    const reached = pickReachedPeriod(periods, nowMs);

    if (reached === null) {
      continue;
    }

    const routes = Object.entries(status.routes)
      .filter(([, route]) => route.provider === provider)
      .map(([id]) => id);

    trips.push(buildProviderTrip({ provider, routes, period: reached, periods, nowMs }));
  }

  return trips;
}

interface ProviderTripParts {
  readonly provider: string;
  readonly routes: readonly string[];
  readonly period: PeriodName;
  readonly periods: GatewayStatus['providers'][string];
  readonly nowMs: number;
}

function buildProviderTrip(parts: ProviderTripParts): ProviderTrip {
  const count = parts.periods[parts.period];

  return {
    provider: parts.provider,
    routes: parts.routes,
    period: parts.period,
    start: count.start,
    limit: count.limit ?? 0,
    spent: count.dollars,
    at: count.sinceMs ?? parts.nowMs,
    resetsAt: Date.parse(count.resetsAt),
    canRaise: parts.period === 'day' && count.cap !== null && (count.limit ?? 0) < count.cap,
    cap: count.cap,
  };
}
