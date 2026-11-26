import type { LocalDate, PeriodKind } from './types';

// The first day of the period that holds a local date, and the first day of the period after it.
export function pickPeriodDates(
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
