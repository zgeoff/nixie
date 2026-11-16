import type { Measures, Override, PeriodCount, PeriodName } from '../types';

// The limit that binds a period: the override when it applies to the period's current start,
// otherwise the larger of the base limit and the day's raise. A period with no base limit has none
// in force, whatever else is set.
export function pickLimitInForce(
  name: PeriodName,
  count: PeriodCount,
  override: Override | null,
): Measures | null {
  if (count.limit === null) {
    return null;
  }

  if (override !== null && override.period === name && override.start === count.start) {
    return override.limit;
  }

  if (count.raise === null) {
    return count.limit;
  }

  return {
    dollars: Math.max(count.limit.dollars, count.raise.dollars),
    tokens: Math.max(count.limit.tokens, count.raise.tokens),
  };
}
