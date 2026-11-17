import { buildLocalInstant } from './build-local-instant';

// The epoch milliseconds at which a date, 'YYYY-MM-DD', starts in the zone.
export function buildDayStart(date: string, zone: string): number {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);

  return buildLocalInstant({ year, month, day }, 0, zone);
}
