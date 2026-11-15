import { expect, test } from 'bun:test';
import { pickQuietUntil } from './pick-quiet-until';

test.each([
  { name: 'no quiet time and no lapse', quietUntil: null, lapsedAt: null, expected: null },
  { name: 'a quiet time alone', quietUntil: 5000, lapsedAt: null, expected: 5000 },
  { name: 'a lapse alone', quietUntil: null, lapsedAt: 1000, expected: 1100 },
  {
    name: 'a later quiet time than the lapse gives',
    quietUntil: 5000,
    lapsedAt: 1000,
    expected: 5000,
  },
  { name: 'a later lapse than the quiet time', quietUntil: 1050, lapsedAt: 1000, expected: 1100 },
])('it gives the end of the quiet for $name', (row) => {
  expect(pickQuietUntil(row.quietUntil, row.lapsedAt, 100)).toBe(row.expected);
});
