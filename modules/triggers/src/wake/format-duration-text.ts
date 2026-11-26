const units = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1000],
] as const;

// The text of a duration in the largest unit that holds it whole, such as 30m or 7d.
export function formatDurationText(durationMs: number): string {
  const unit = units.find((entry) => durationMs % entry[1] === 0);

  return unit === undefined
    ? `${String(durationMs)}ms`
    : `${String(durationMs / unit[1])}${unit[0]}`;
}
