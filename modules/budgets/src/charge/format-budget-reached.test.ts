import { expect, test } from 'bun:test';
import { formatBudgetReached, formatBudgetRefusal } from './format-budget-reached';

test.each([
  ['day', '2026-10-17', 'budget reached: search-day ($5.00 of $5.00). Resets at midnight.'],
  ['week', '2026-10-19', 'budget reached: search-day ($5.00 of $5.00). Resets on Monday.'],
  ['month', '2026-12-01', 'budget reached: search-day ($5.00 of $5.00). Resets on December 1.'],
] as const)('it reads the reset of a %s budget', (period, resetsOn, text) => {
  expect(
    formatBudgetReached({
      error: 'budget_reached',
      budgetID: 'search-day',
      period,
      spentMicros: 5_000_000,
      limitMicros: 5_000_000,
      resetsAt: 0,
      resetsOn,
    }),
  ).toBe(text);
});

test('it reads cents of a fraction of a cent', () => {
  expect(
    formatBudgetReached({
      error: 'budget_reached',
      budgetID: 'search-day',
      period: 'day',
      spentMicros: 4_975_000,
      limitMicros: 5_000_000,
      resetsAt: 0,
      resetsOn: '2026-10-17',
    }),
  ).toBe('budget reached: search-day ($4.98 of $5.00). Resets at midnight.');
});

test.each([
  ['day', '2026-10-17', 'budget reached: search-day. Resets at midnight.'],
  ['week', '2026-10-19', 'budget reached: search-day. Resets on Monday.'],
  ['month', '2026-12-01', 'budget reached: search-day. Resets on December 1.'],
] as const)('it refuses a %s budget with no dollar figure', (period, resetsOn, text) => {
  expect(
    formatBudgetRefusal({
      error: 'budget_reached',
      budgetID: 'search-day',
      period,
      spentMicros: 5_000_000,
      limitMicros: 5_000_000,
      resetsAt: 0,
      resetsOn,
    }),
  ).toBe(text);
});
