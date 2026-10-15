export interface BackoffSchedule {
  // the wait after the first failure
  readonly firstMs: number;

  // the longest wait, which every later failure keeps
  readonly maxMs: number;

  // what each failure after the first multiplies the wait by: 2 by default, so the wait doubles
  readonly factor?: number;
}

// The wait before the next try after the nth failure in a row: the first wait, times the factor
// for each failure after the first, up to the maximum. A count of 0 waits as long as 1.
export function planBackoffDelay(failures: number, schedule: BackoffSchedule): number {
  const growth = (schedule.factor ?? 2) ** Math.max(failures - 1, 0);

  // a growth past the largest number overflows to Infinity, and a zero first wait times Infinity
  // is NaN, so the largest number stands in for it
  return Math.min(schedule.firstMs * Math.min(growth, Number.MAX_VALUE), schedule.maxMs);
}
