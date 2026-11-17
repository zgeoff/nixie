import type { SpendStop } from '../types';
import type { SpendStopRow } from './read-spend-stop-row';

export type ClearReason = 'reset' | 'raised' | 'reachable' | 'lost_cleared';

export interface TripPayload {
  readonly reason: 'limit' | 'unreachable' | 'lost';
  readonly at: number;
  readonly period?: 'day' | 'month';
  readonly measure?: 'dollars' | 'tokens' | 'turns';
  readonly limit?: number;
  readonly spent?: number;
  readonly resetsAt?: number;
}

export interface SpendMove {
  readonly clear: ClearReason | null;
  readonly trip: TripPayload | null;
}

// The writes that bring the log's stop in line with what the stop is now. A stop that differs from
// the standing one clears it first, so each trip is a record of its own.
export function pickSpendMove(
  standing: SpendStopRow | null,
  stop: SpendStop,
  now: number,
): SpendMove {
  if (stop.state === 'clear') {
    return { clear: standing === null ? null : pickClearReason(standing, now), trip: null };
  }

  const trip = toTrip(stop, now);

  if (standing === null) {
    return { clear: null, trip };
  }

  if (isSameStop(standing, trip)) {
    return { clear: null, trip: null };
  }

  return { clear: pickClearReason(standing, now), trip };
}

function pickClearReason(standing: SpendStopRow, now: number): ClearReason {
  if (standing.reason === 'unreachable') {
    return 'reachable';
  }

  if (standing.reason === 'lost') {
    return 'lost_cleared';
  }

  return standing.resetsAt !== null && now >= standing.resetsAt ? 'reset' : 'raised';
}

function toTrip(stop: Exclude<SpendStop, { readonly state: 'clear' }>, now: number): TripPayload {
  if (stop.state === 'tripped') {
    return {
      reason: 'limit',
      at: stop.at,
      period: stop.period,
      measure: stop.measure,
      limit: stop.limit,
      spent: stop.spent,
      resetsAt: stop.resetsAt,
    };
  }

  return { reason: stop.state, at: now };
}

function isSameStop(standing: SpendStopRow, trip: TripPayload): boolean {
  if (standing.reason !== trip.reason) {
    return false;
  }

  return (
    standing.reason !== 'limit' ||
    (standing.period === trip.period &&
      standing.measure === trip.measure &&
      standing.limit === trip.limit &&
      standing.resetsAt === trip.resetsAt)
  );
}
