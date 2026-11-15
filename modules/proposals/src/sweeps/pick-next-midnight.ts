import { toWallClock, toZonedInstant } from './pick-return-at';

const dayMs = 24 * 60 * 60 * 1000;

// The first midnight after the time, on the wall clock of the zone.
export function pickNextMidnight(at: number, zone: string): number {
  const local = toWallClock(at, zone);

  return toZonedInstant(Date.UTC(local.year, local.month - 1, local.day) + dayMs, zone, at);
}
