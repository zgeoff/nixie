import type { UsagePosition } from './compare-usage-position';

// `<time>.<sequence>` where the time is the last surfaced time in milliseconds, or `never`. The
// cursor holds the entry's place in the order, so a page continues after it whatever else moved.
export function buildUsageCursor(position: UsagePosition): string {
  const surfaced = position.surfacedAtMs === null ? 'never' : String(position.surfacedAtMs);

  return `${surfaced}.${String(position.createdSequence)}`;
}
