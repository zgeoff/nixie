import type { BudgetPeriod } from '@heynixie/policy';
import type { BudgetReached } from '../types';

// The text that a paid tool returns to the model, and the client shows in its notice.
export function formatBudgetReached(reached: BudgetReached): string {
  const spent = formatDollars(reached.spentMicros);
  const limit = formatDollars(reached.limitMicros);

  return `budget reached: ${reached.budgetID} (${spent} of ${limit}). ${formatBudgetReset(reached.period, reached.resetsOn)}`;
}

const weekdayName = 'Monday';

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// The reset of a day reads as midnight, a week's as Monday and a month's as the date of the next
// period's first day.
export function formatBudgetReset(period: BudgetPeriod, resetsOn: string): string {
  if (period === 'day') {
    return 'Resets at midnight.';
  }

  if (period === 'week') {
    return `Resets on ${weekdayName}.`;
  }

  const [, month = 1, day = 1] = resetsOn.split('-').map(Number);

  return `Resets on ${monthNames[month - 1] ?? ''} ${String(day)}.`;
}

export function formatDollars(micros: number): string {
  return `$${(Math.round(micros / 10_000) / 100).toFixed(2)}`;
}
