// Date.parse rolls 2026-02-30 over into March, so a parsed date must read back as written. A value
// that fails reads as NaN, so the caller refuses it.
export function parseUTCTime(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const date = value.slice(0, 10);
  const day = Date.parse(date);

  if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== date) {
    return Number.NaN;
  }

  return Date.parse(value);
}
