import { expect, test } from 'bun:test';
import { getPinnedCoreBudget } from './get-pinned-core-budget';

test('it reads the budget the context sets', () => {
  expect(getPinnedCoreBudget({ pinnedCoreTokens: 500 })).toBe(500);
});

test('it reads 2,000 tokens when the context sets none', () => {
  expect(getPinnedCoreBudget({})).toBe(2000);
});
