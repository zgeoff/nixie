// A time as the model reads it in a field that cannot carry words: the instant in ISO 8601, or null
// for text that is no time.
export function toISOTime(value: string): string | null {
  const timeMs = Date.parse(value);

  return Number.isNaN(timeMs) ? null : new Date(timeMs).toISOString();
}
