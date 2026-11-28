// The longest retry time that nixie keeps. A provider that asks for more gets the same answer, and
// the model tells the user when to ask again.
const longestRetryMs = 86_400_000;

// Reads a `Retry-After` header: a count of seconds, or an HTTP date, which counts from the date the
// provider's own answer carries. Returns null for a header that is absent or holds neither.
export function readRetryAfterMs(headers: Headers): number | null {
  const value = headers.get('retry-after')?.trim();

  if (value === undefined || value === '') {
    return null;
  }

  if (/^\d+$/u.test(value)) {
    return Math.min(Number(value) * 1000, longestRetryMs);
  }

  const atMs = /[a-z]/iu.test(value) ? Date.parse(value) : Number.NaN;
  const sentAtMs = Date.parse(headers.get('date') ?? '');

  if (Number.isNaN(atMs) || Number.isNaN(sentAtMs)) {
    return null;
  }

  return Math.min(Math.max(atMs - sentAtMs, 0), longestRetryMs);
}
