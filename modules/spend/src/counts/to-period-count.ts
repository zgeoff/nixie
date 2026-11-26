import type { GatewayStatus } from '../types';
import type { PeriodCount } from './types';

export function toPeriodCount(period: GatewayStatus['routes'][string]['day']): PeriodCount {
  return {
    start: period.start,
    dollars: period.dollars,
    limit: period.limit,
    tripped: period.tripped,
  };
}
