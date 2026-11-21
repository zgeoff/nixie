import type { PaidToolLimits } from '@heynixie/budgets';

// The tools that charge a price for each call. Each takes the built-in budgets `<name>-day` and
// `<name>-month`, so a tool joins this list in the change that gives it `paid`.
export const paidToolNames: readonly string[] = ['search', 'image.draw'];

// The tools whose budgets start below the default of $5 a day and $50 a month.
export const paidToolLimits: Readonly<Record<string, PaidToolLimits>> = {
  'image.draw': { dayMicros: 2_000_000, monthMicros: 20_000_000 },
};
