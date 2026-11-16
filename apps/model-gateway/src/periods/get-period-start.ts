import type { PeriodName } from '../types';

// the first day of the period that holds the ISO date
export function getPeriodStart(period: PeriodName, date: string): string {
  return period === 'day' ? date : `${date.slice(0, 8)}01`;
}
