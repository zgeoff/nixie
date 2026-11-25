import { expect, test } from 'bun:test';
import { toMicros } from './to-micros';

test.each([
  { name: 'one micro', dollars: 1e-6, expected: 1 },
  { name: 'a tenth of a dollar', dollars: 0.1, expected: 100_000 },
  { name: 'one token at 0.10 dollars per million', dollars: 1e-7, expected: 1 },
  { name: 'nothing', dollars: 0, expected: 0 },
])('#toMicros turns the dollars of $name into whole micros', (row) => {
  expect(toMicros(row.dollars)).toBe(row.expected);
});
