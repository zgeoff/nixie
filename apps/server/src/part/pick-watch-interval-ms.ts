const hourMs = 60 * 60 * 1000;

// How often the status watch looks: hourly, or at least 4 times in the notice time, so a break that
// crosses a short notice time is seen before it ends.
export function pickWatchIntervalMs(breakNoticeMs: number): number {
  return Math.max(1, Math.min(hourMs, Math.floor(breakNoticeMs / 4)));
}
