import { buildDayStart } from '@heynixie/clock';
import { periodOf } from '@heynixie/periods';
import invariant from 'tiny-invariant';
import type { PeriodCount, PeriodName } from '../types';

// When a count's period ends. A count that carries its end keeps it, whatever the zone is now.
// A count from before the stamp names no zone, so its period ends at the next UTC start: a zone set
// since then never cuts it short.
export function buildResetMs(name: PeriodName, count: PeriodCount): number {
  if (count.resetsAt !== null) {
    return Date.parse(count.resetsAt);
  }

  const ends = periodOf(name, buildDayStart(count.start, 'UTC'), 'UTC').endsAtMs;

  invariant(ends !== null, 'a day and a month end');

  return ends;
}
