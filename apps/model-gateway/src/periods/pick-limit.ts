import type { Overrides, PeriodName, RouteCount, RouteLimits } from '../types';
import { pickDayLimit } from './pick-day-limit';

// The limit in force of one period, or null for a target with no limits or no count
export function pickLimit(
  configured: RouteLimits | null | undefined,
  count: RouteCount | undefined,
  override: Overrides['routes'][string] | undefined,
  period: PeriodName,
): number | null {
  if (configured === null || configured === undefined || count === undefined) {
    return null;
  }

  return period === 'month' ? configured.month : pickDayLimit(configured, count, override);
}
