import { buildZoneParts } from './build-zone-parts';

// The milliseconds that the zone's clock runs ahead of UTC at an instant.
export function buildZoneOffsetMs(instantMs: number, zone: string): number {
  const parts = buildZoneParts(instantMs, zone);

  const localMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return localMs - Math.floor(instantMs / 1000) * 1000;
}
