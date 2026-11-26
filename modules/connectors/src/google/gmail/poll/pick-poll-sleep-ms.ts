const minSleepMs = 1000;

interface PollSleep {
  readonly nowMs: number;
  readonly pollIntervalMs: number;

  // when each pollable connection's next poll falls due
  readonly dueAts: readonly number[];
}

// How long the loop sleeps: until the next connection falls due, never under a second, and never
// past the poll interval, so a connection that joins the list during a long backoff of another
// still gets its first poll within an interval.
export function pickPollSleepMs(sleep: PollSleep): number {
  const nextAt = Math.min(sleep.nowMs + sleep.pollIntervalMs, ...sleep.dueAts);

  return Math.max(minSleepMs, nextAt - sleep.nowMs);
}
