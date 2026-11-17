import type { LocalDate } from '@heynixie/clock';

// 0 is Sunday
export function getWeekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}
