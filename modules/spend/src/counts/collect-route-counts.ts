import type { GatewayStatus } from '../types';
import { toPeriodCount } from './to-period-count';
import type { RouteCounts } from './types';

export function collectRouteCounts(status: GatewayStatus): RouteCounts[] {
  return Object.entries(status.routes).map(([route, periods]) => ({
    route,
    provider: periods.provider,
    day: toPeriodCount(periods.day),
    month: toPeriodCount(periods.month),
  }));
}
