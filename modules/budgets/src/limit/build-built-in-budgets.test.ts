import { expect, test } from 'bun:test';
import { buildBuiltInBudgets } from './build-built-in-budgets';

test('it gives each paid tool a day budget of $5 and a month budget of $50', () => {
  expect(buildBuiltInBudgets(['search', 'maps'])).toStrictEqual([
    { id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' },
    { id: 'search-month', counts: 'tool:search', limitMicros: 50_000_000, period: 'month' },
    { id: 'maps-day', counts: 'tool:maps', limitMicros: 5_000_000, period: 'day' },
    { id: 'maps-month', counts: 'tool:maps', limitMicros: 50_000_000, period: 'month' },
  ]);
});

test('it gives no budget when no tool is paid', () => {
  expect(buildBuiltInBudgets([])).toStrictEqual([]);
});

test('it gives a tool the limits its entry names, and the others the defaults', () => {
  expect(
    buildBuiltInBudgets(['search', 'image.draw'], {
      'image.draw': { dayMicros: 2_000_000, monthMicros: 20_000_000 },
    }),
  ).toStrictEqual([
    { id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' },
    { id: 'search-month', counts: 'tool:search', limitMicros: 50_000_000, period: 'month' },
    { id: 'image.draw-day', counts: 'tool:image.draw', limitMicros: 2_000_000, period: 'day' },
    { id: 'image.draw-month', counts: 'tool:image.draw', limitMicros: 20_000_000, period: 'month' },
  ]);
});
