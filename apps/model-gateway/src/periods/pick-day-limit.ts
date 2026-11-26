import type { DayOverride, RouteCount, RouteLimits } from '../types';

// The limit that binds a route's day: the override when it applies to the day's start, otherwise
// the larger of the configured limit and the day's raise.
export function pickDayLimit(
  limits: RouteLimits,
  count: RouteCount,
  override: DayOverride | undefined,
): number {
  if (override !== undefined && override.start === count.start) {
    return override.dollars;
  }

  return Math.max(limits.day, count.raise ?? 0);
}
