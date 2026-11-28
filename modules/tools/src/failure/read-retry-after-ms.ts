// The longest retry time that nixie keeps. A provider that asks for more gets the same answer, and
// the model tells the user when to ask again.
const longestRetryMs = 86_400_000;

// Reads a `Retry-After` header: a count of seconds, or an HTTP date, which counts from the date the
// provider's own answer carries, or from `nowMs` when the answer carries none. Returns null for a
// header that is absent or holds neither.
export function readRetryAfterMs(headers: Headers, nowMs: number): number | null {
  const value = headers.get('retry-after')?.trim();

  if (value === undefined || value === '') {
    return null;
  }

  if (/^\d+$/u.test(value)) {
    return Math.min(Number(value) * 1000, longestRetryMs);
  }

  const atMs = /[a-z]/iu.test(value) ? Date.parse(value) : Number.NaN;
  const providerSentAtMs = Date.parse(headers.get('date') ?? '');
  const sentAtMs = Number.isNaN(providerSentAtMs) ? nowMs : providerSentAtMs;

  if (Number.isNaN(atMs)) {
    return null;
  }

  return Math.min(Math.max(atMs - sentAtMs, 0), longestRetryMs);
}
