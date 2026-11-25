import { expect, test } from 'bun:test';
import { toMicros } from './to-micros';

test.each([
  { name: 'one micro', dollars: 1e-6, expected: 1 },
  { name: 'a tenth of a dollar', dollars: 0.1, expected: 100_000 },
])('#toMicros turns the dollars of $name into whole micros', (row) => {
  expect(toMicros(row.dollars)).toBe(row.expected);
});
