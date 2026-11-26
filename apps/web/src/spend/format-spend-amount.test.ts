import { expect, test } from 'bun:test';
import { formatSpendAmount } from './format-spend-amount';

test.each([
  [12.4, '$12.40 (about A$19)'],
  [0, '$0.00 (about A$0.00)'],
  [2.5, '$2.50 (about A$3.80)'],
  [600, '$600.00 (about A$912)'],
])('it shows %s dollars with the approximate amount in the display currency', (dollars, shown) => {
  expect(formatSpendAmount(dollars, { currency: 'AUD', rate: 1.52 })).toBe(shown);
});

test('it shows US dollars alone with no display', () => {
  expect(formatSpendAmount(12.4, null)).toBe('$12.40');
});
