export const pageEventsPerSecond = 1;
export const pageEventsPerMinute = 30;

export interface PageEventLimits {
  // true and counts the event when the region has room for it, false and counts nothing when a
  // limit drops it
  readonly admit: (deviceID: string, region: string, nowMs: number) => boolean;
}

// How often each page region may send an event: 1 a second and 30 a minute. The device drops the
// rest, and this keeps the same limits for a client that does not.
export function createPageEventLimits(): PageEventLimits {
  const sent = new Map<string, number[]>();

  return {
    admit: (deviceID, region, nowMs) => {
      const key = `${deviceID}\u0000${region}`;
      const recent = (sent.get(key) ?? []).filter((atMs) => nowMs - atMs < 60_000);
      const last = recent.at(-1);

      if (
        recent.length >= pageEventsPerMinute ||
        (last !== undefined && nowMs - last < 1000 / pageEventsPerSecond)
      ) {
        sent.set(key, recent);

        return false;
      }

      sent.set(key, [...recent, nowMs]);

      return true;
    },
  };
}
