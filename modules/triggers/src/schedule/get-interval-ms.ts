import type { Schedule } from '@heynixie/contract';

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

// The gap between 2 slots of a schedule, which the half-interval rule of a catch-up measures.
export function getIntervalMs(every: Schedule['every']): number {
  if (every === 'day') {
    return dayMs;
  }

  if (every === 'week') {
    return 7 * dayMs;
  }

  return every === 'hour' ? hourMs : every.minutes * minuteMs;
}
