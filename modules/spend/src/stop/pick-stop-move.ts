import type { PeriodName } from '../types';

type StopClearReason = 'reset' | 'raised' | 'corrected';

// A standing stop or a trip, with the limit it stands at
export interface StopLimit {
  readonly period: PeriodName;
  readonly limit: number;
  readonly resetsAt: number;

  // the routes that a provider's stop stops, which a route's stop leaves out
  readonly routes?: readonly string[];
}

export interface StopMove<Trip> {
  // each stop to clear, with why
  readonly clears: readonly { readonly key: string; readonly reason: StopClearReason }[];

  // each trip to write: the notice to the owner
  readonly trips: readonly Trip[];

  // each stop that stands at another limit or period: the row changes, and the stop stays
  readonly restates: readonly Trip[];
}

export interface StopMoveAsk<Field extends string, Trip extends StopLimit & Record<Field, string>> {
  // the field that names the route or the provider that a stop stops
  readonly field: Field;
  readonly standing: readonly (StopLimit & Record<Field, string>)[];
  readonly trips: readonly Trip[];
  readonly nowMs: number;
  readonly roomReason: Exclude<StopClearReason, 'reset'>;
}

// The writes that bring the standing stops in line with the routes or providers at their limits. A
// stop that stands writes nothing, a changed one, or a provider's that gains or loses a route, is
// restated, and a stop with room again clears as `reset` once its period ended, else `roomReason`.
export function pickStopMove<Field extends string, Trip extends StopLimit & Record<Field, string>>(
  ask: StopMoveAsk<Field, Trip>,
): StopMove<Trip> {
  const field = ask.field;
  const standing = ask.standing;
  const nowMs = ask.nowMs;
  const roomReason = ask.roomReason;
  const clears: { key: string; reason: StopClearReason }[] = [];
  const tripped: Trip[] = [];
  const restates: Trip[] = [];
  const live = ask.trips.filter((trip) => trip.resetsAt > nowMs);

  for (const row of standing) {
    if (!live.some((trip) => trip[field] === row[field])) {
      clears.push({ key: row[field], reason: nowMs >= row.resetsAt ? 'reset' : roomReason });
    }
  }

  for (const trip of live) {
    const row = standing.find((candidate) => candidate[field] === trip[field]);

    if (row === undefined) {
      tripped.push(trip);
    } else if (!isSameStop(row, trip)) {
      restates.push(trip);
    }
  }

  return { clears, trips: tripped, restates };
}

function isSameStop(row: StopLimit, trip: StopLimit): boolean {
  return (
    row.period === trip.period &&
    row.limit === trip.limit &&
    row.resetsAt === trip.resetsAt &&
    isSameRoutes(row.routes, trip.routes)
  );
}

function isSameRoutes(
  earlier: readonly string[] | undefined,
  later: readonly string[] | undefined,
): boolean {
  if (earlier === undefined || later === undefined) {
    return earlier === later;
  }

  return earlier.length === later.length && later.every((route) => earlier.includes(route));
}
