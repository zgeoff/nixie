// Whether a region's content still shows: it has no end, or its end is ahead.
export function isRegionActive(untilMs: number | null, nowMs: number): boolean {
  return untilMs === null || untilMs > nowMs;
}
