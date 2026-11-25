import type { RouteTrip } from '../types';
import type { SpendRouteStopRow } from './read-spend-route-stops';

type RouteClearReason = 'reset' | 'raised';

export interface RouteMove {
  // each stop to clear, with why
  readonly clears: readonly { readonly route: string; readonly reason: RouteClearReason }[];

  // each trip to write: the notice to the owner
  readonly trips: readonly RouteTrip[];
}

// The writes that bring the standing route stops in line with the routes at their limits. A stop
// that stands for the same period and the same limit writes nothing, so a trip sends one notice. A
// stop that differs clears first, so each trip is a record of its own.
export function pickRouteMove(
  standing: readonly SpendRouteStopRow[],
  trips: readonly RouteTrip[],
  nowMs: number,
): RouteMove {
  const clears: { route: string; reason: RouteClearReason }[] = [];
  const written: RouteTrip[] = [];

  for (const row of standing) {
    const trip = trips.find((candidate) => candidate.route === row.route);

    if (trip === undefined || !isSameStop(row, trip)) {
      clears.push({ route: row.route, reason: nowMs >= row.resetsAt ? 'reset' : 'raised' });
    }
  }

  for (const trip of trips) {
    const row = standing.find((candidate) => candidate.route === trip.route);

    if (row === undefined || !isSameStop(row, trip)) {
      written.push(trip);
    }
  }

  return { clears, trips: written };
}

function isSameStop(row: SpendRouteStopRow, trip: RouteTrip): boolean {
  return row.period === trip.period && row.limit === trip.limit && row.resetsAt === trip.resetsAt;
}
