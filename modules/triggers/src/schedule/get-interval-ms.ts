import type { Repeat } from '@heynixie/contract';

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

const frequencyMs = {
  minutely: minuteMs,
  hourly: hourMs,
  daily: dayMs,
  weekly: 7 * dayMs,
  monthly: 30 * dayMs,
  yearly: 365 * dayMs,
} as const;

// The nominal gap between 2 slots of a repeat, which the half-interval rule of a catch-up measures.
// The real gap varies with the days and hours the schedule names.
export function getIntervalMs(repeat: Repeat): number {
  return frequencyMs[repeat.frequency] * (repeat.interval ?? 1);
}
