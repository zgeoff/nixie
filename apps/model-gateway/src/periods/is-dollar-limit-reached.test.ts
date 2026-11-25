import { expect, test } from 'bun:test';
import { isDollarLimitReached } from './is-dollar-limit-reached';

test.each([
  { name: 'a count under the limit', spent: 0.99, limit: 1, expected: false },
  { name: 'a count at the limit', spent: 1, limit: 1, expected: true },
  { name: 'a count over the limit', spent: 1.5, limit: 1, expected: true },
])('#isDollarLimitReached answers $expected for $name', (row) => {
  expect(isDollarLimitReached(row.spent, row.limit)).toBe(row.expected);
});

test('#isDollarLimitReached finds ten replies of 0.1 dollars summed in floating point at a limit of 1 dollar', () => {
  let spent = 0;

  for (let reply = 0; reply < 10; reply += 1) {
    spent += 0.1;
  }

  expect(isDollarLimitReached(spent, 1)).toBe(true);
});
