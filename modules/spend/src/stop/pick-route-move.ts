import type { RouteTrip } from '../types';
import type { SpendRouteStopRow } from './read-spend-route-stops';

type RouteClearReason = 'reset' | 'raised';

export interface RouteMove {
  // each stop to clear, with why
  readonly clears: readonly { readonly route: string; readonly reason: RouteClearReason }[];

  // each trip to write: the notice to the owner
  readonly trips: readonly RouteTrip[];

  // each stop that stands at another limit or period: the row changes, and the route stays stopped
  readonly restates: readonly RouteTrip[];
}

// The writes that bring the standing route stops in line with the routes at their limits. The same
// stop writes nothing, so a trip sends one notice; a changed one is restated and keeps its holds. A
// trip whose period has ended is a read of an earlier count, so it is no trip.
export function pickRouteMove(
  standing: readonly SpendRouteStopRow[],
  trips: readonly RouteTrip[],
  nowMs: number,
): RouteMove {
  const clears: { route: string; reason: RouteClearReason }[] = [];
  const tripped: RouteTrip[] = [];
  const restates: RouteTrip[] = [];
  const live = trips.filter((trip) => trip.resetsAt > nowMs);

  for (const row of standing) {
    if (!live.some((trip) => trip.route === row.route)) {
      clears.push({ route: row.route, reason: nowMs >= row.resetsAt ? 'reset' : 'raised' });
    }
  }

  for (const trip of live) {
    const row = standing.find((candidate) => candidate.route === trip.route);

    if (row === undefined) {
      tripped.push(trip);
    } else if (!isSameStop(row, trip)) {
      restates.push(trip);
    }
  }

  return { clears, trips: tripped, restates };
}

function isSameStop(row: SpendRouteStopRow, trip: RouteTrip): boolean {
  return row.period === trip.period && row.limit === trip.limit && row.resetsAt === trip.resetsAt;
}
