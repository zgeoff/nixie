import { buildZoneOffsetMs } from './build-zone-offset-ms';
import type { LocalDate } from './build-zone-parts';

const dayMs = 86_400_000;

// The instant at which the zone's clock first shows the local time. A time that the clock skips
// gives the first instant after the gap, and a time that it shows twice gives the first of the two.
export function buildLocalInstant(date: LocalDate, minuteOfDay: number, zone: string): number {
  const localMs = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay);

  const offsets = [
    ...new Set([
      buildZoneOffsetMs(localMs - dayMs, zone),
      buildZoneOffsetMs(localMs + dayMs, zone),
    ]),
  ];

  const valid = offsets.flatMap((offset) =>
    buildZoneOffsetMs(localMs - offset, zone) === offset ? [localMs - offset] : [],
  );

  return valid.length > 0 ? Math.min(...valid) : getGapEnd(offsets, localMs, zone);
}

const searchStepMs = 1000;

// Searches for the instant at which the offset changes, between the 2 readings of the local time.
function getGapEnd(offsets: readonly number[], localMs: number, zone: string): number {
  const afterOffset = Math.max(...offsets);
  let low = localMs - afterOffset;
  let high = localMs - Math.min(...offsets);

  while (high - low > searchStepMs) {
    const middle = low + Math.floor((high - low) / 2 / searchStepMs) * searchStepMs;

    if (buildZoneOffsetMs(middle, zone) === afterOffset) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return high;
}
