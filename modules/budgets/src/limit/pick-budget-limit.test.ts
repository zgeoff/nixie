import { expect, test } from 'bun:test';
import { pickBudgetLimit } from './pick-budget-limit';

test('it picks the budget in force over the built-in budget with the same ID', () => {
  expect(
    pickBudgetLimit(
      'search-day',
      [{ id: 'search-day', counts: 'tool:search', limitMicros: 1_000_000, period: 'day' }],
      [{ id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' }],
    ),
  ).toStrictEqual({
    id: 'search-day',
    counts: 'tool:search',
    limitMicros: 1_000_000,
    period: 'day',
  });
});

test('it picks the built-in budget when none in force has the ID', () => {
  expect(
    pickBudgetLimit(
      'search-day',
      [],
      [{ id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' }],
    ),
  ).toStrictEqual({
    id: 'search-day',
    counts: 'tool:search',
    limitMicros: 5_000_000,
    period: 'day',
  });
});

test('it picks nothing for an ID that no one defines', () => {
  expect(pickBudgetLimit('pet-month', [], [])).toBeNull();
});
