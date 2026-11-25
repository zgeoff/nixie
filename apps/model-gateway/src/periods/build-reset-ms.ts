import { buildDayStart } from '@heynixie/clock';
import { periodOf } from '@heynixie/periods';
import invariant from 'tiny-invariant';
import type { PeriodCount, PeriodName } from '../types';

// When a count's period ends. A count that carries its end keeps it, whatever the zone is now.
// Otherwise the end is the next start in the zone: local midnight of the count's start lies inside
// its period, so the period ends when its next one starts.
export function buildResetMs(name: PeriodName, count: PeriodCount, zone: string): number {
  if (count.resetsAt !== null) {
    return Date.parse(count.resetsAt);
  }

  const ends = periodOf(name, buildDayStart(count.start, zone), zone).endsAtMs;

  invariant(ends !== null, 'a day and a month end');

  return ends;
}
