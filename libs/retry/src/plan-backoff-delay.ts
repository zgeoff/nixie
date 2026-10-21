export interface BackoffSchedule {
  readonly firstMs: number;

  readonly maxMs: number;

  readonly factor?: number;
}

export function planBackoffDelay(failures: number, schedule: BackoffSchedule): number {
  const growth = (schedule.factor ?? 2) ** Math.max(failures - 1, 0);

  // A growth past the largest number overflows to Infinity, and a zero first wait times Infinity
  // is NaN, so the largest number stands in for Infinity.
  return Math.min(schedule.firstMs * Math.min(growth, Number.MAX_VALUE), schedule.maxMs);
}
