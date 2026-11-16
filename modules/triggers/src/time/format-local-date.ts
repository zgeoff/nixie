import type { LocalDate } from './build-zone-parts';

// 'YYYY-MM-DD'
export function formatLocalDate(date: LocalDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');

  return `${date.year}-${month}-${day}`;
}
