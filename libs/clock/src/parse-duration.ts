const durationPattern = /^(?<amount>[1-9][0-9]{0,8})(?<unit>ms|s|m|h|d)$/u;

// Reads a duration such as 500ms, 5s, 10m, 24h or 7d, and returns null for any other text.
export function parseDuration(text: string): number | null {
  const groups = durationPattern.exec(text)?.groups;
  const amount = groups?.['amount'];
  const unit = groups?.['unit'];

  if (amount === undefined || unit === undefined) {
    return null;
  }

  const unitMilliseconds = new Map([
    ['ms', 1],
    ['s', 1000],
    ['m', 60_000],
    ['h', 3_600_000],
    ['d', 86_400_000],
  ]);

  return Number(amount) * (unitMilliseconds.get(unit) ?? 1);
}
