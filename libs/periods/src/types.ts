export type PeriodKind = 'day' | 'week' | 'month' | 'none';

export interface Period {
  readonly kind: PeriodKind;

  // the ISO date of the period's first day in the zone; '' for a period that never resets
  readonly start: string;
  readonly startsAtMs: number;

  // when the next period starts, which is when this one resets; null for a period that never resets
  readonly endsAtMs: number | null;
}
