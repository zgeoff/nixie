import { expect, test } from 'bun:test';
import { toDollars } from './to-dollars';

test('#toDollars turns whole micros back into dollars', () => {
  expect(toDollars(1_500_000)).toBe(1.5);
});
