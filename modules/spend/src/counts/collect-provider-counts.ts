import type { GatewayStatus } from '../types';
import { toPeriodCount } from './to-period-count';
import type { ProviderCounts } from './types';

export function collectProviderCounts(status: GatewayStatus): ProviderCounts[] {
  return Object.entries(status.providers).map(([provider, periods]) => ({
    provider,
    day: toPeriodCount(periods.day),
    month: toPeriodCount(periods.month),
  }));
}
