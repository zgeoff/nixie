import { buildZoneOffsetMs } from '@heynixie/clock';

const quarterHourMs = 900_000;

// Whether the zone's offset from UTC is a whole number of 15 minutes at each instant. The turn count
// keeps 15-minute buckets, so a day in the zone is a sum of whole buckets only when this holds.
export function hasQuarterHourOffsets(zone: string, instantsMs: readonly number[]): boolean {
  return instantsMs.every((instantMs) => buildZoneOffsetMs(instantMs, zone) % quarterHourMs === 0);
}
