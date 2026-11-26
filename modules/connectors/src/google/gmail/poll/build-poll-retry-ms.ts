const firstRetryMs = 60_000;
const maxRetryMs = 60 * 60_000;

// The wait after a run of failed polls of one connection: a minute after the first, doubling after
// each, up to an hour, or Google's own retry time when that is longer.
export function buildPollRetryMs(failures: number, retryAfterMs: number | null): number {
  const backoffMs = Math.min(maxRetryMs, firstRetryMs * 2 ** Math.max(0, failures - 1));

  return Math.max(backoffMs, retryAfterMs ?? 0);
}
