import type { PeriodName } from '../types';
import { getLocalDate } from './get-local-date';

const hourMs = 3_600_000;

// the first instant whose local date reaches the ISO date: the period's next start, which is local
// midnight unless a zone skips it
export function getResetMs(period: PeriodName, start: string, zone: string): number {
  const date = getNextPeriodStart(period, start);

  // every zone's offset lies within -12 to +14 hours, so local midnight falls in this window
  let low = Date.parse(`${date}T00:00:00Z`) - 15 * hourMs;
  let high = Date.parse(`${date}T00:00:00Z`) + 13 * hourMs;

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);

    if (getLocalDate(middle, zone) >= date) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return high;
}

// the first day of the period after the one that starts on the ISO date
function getNextPeriodStart(period: PeriodName, start: string): string {
  const [year = 0, month = 1, day = 1] = start.split('-').map(Number);

  const next =
    period === 'day'
      ? new Date(Date.UTC(year, month - 1, day + 1))
      : new Date(Date.UTC(year, month, 1));

  return next.toISOString().slice(0, 10);
}
