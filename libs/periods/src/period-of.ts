import { buildDayStart, buildZoneOffsetMs } from '@heynixie/clock';
import { pickPeriodDates } from './pick-period-dates';
import type { Period, PeriodKind } from './types';

// The period of the kind that an instant falls in. A day starts at local midnight in the zone, a
// week on Monday and a month on the 1st, so a clock change makes a day shorter or longer by its
// shift.
export function periodOf(kind: PeriodKind, nowMs: number, zone: string): Period {
  if (kind === 'none') {
    return { kind, start: '', startsAtMs: 0, endsAtMs: null };
  }

  const local = new Date(nowMs + buildZoneOffsetMs(nowMs, zone));

  const [first, next] = pickPeriodDates(kind, {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
  });

  const start = first.toISOString().slice(0, 10);

  return {
    kind,
    start,
    startsAtMs: buildDayStart(start, zone),
    endsAtMs: buildDayStart(next.toISOString().slice(0, 10), zone),
  };
}
