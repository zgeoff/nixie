import { buildDayStart, buildZoneOffsetMs } from '@heynixie/clock';
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

interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

function pickPeriodDates(
  kind: Exclude<PeriodKind, 'none'>,
  local: LocalDate,
): readonly [Date, Date] {
  if (kind === 'day') {
    return [
      new Date(Date.UTC(local.year, local.month, local.day)),
      new Date(Date.UTC(local.year, local.month, local.day + 1)),
    ];
  }

  if (kind === 'week') {
    const sinceMonday = (local.weekday + 6) % 7;

    return [
      new Date(Date.UTC(local.year, local.month, local.day - sinceMonday)),
      new Date(Date.UTC(local.year, local.month, local.day - sinceMonday + 7)),
    ];
  }

  return [
    new Date(Date.UTC(local.year, local.month, 1)),
    new Date(Date.UTC(local.year, local.month + 1, 1)),
  ];
}
