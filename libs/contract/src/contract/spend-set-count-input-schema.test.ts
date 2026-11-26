import { expect, test } from 'bun:test';
import { spendSetCountInputSchema } from './spend-set-count-input-schema';

function setupTest() {
  return { count: { period: 'day', start: '2026-11-13', dollars: 0 } as const };
}

test.each([
  ['a route', { route: 'plan' }],
  ['a provider', { provider: 'main' }],
])('it accepts a count change that names %s', (_name, target) => {
  const ctx = setupTest();

  expect(spendSetCountInputSchema.safeParse({ ...target, ...ctx.count }).success).toBe(true);
});

test.each([
  ['both a route and a provider', { route: 'plan', provider: 'main' }],
  ['neither a route nor a provider', {}],
])('it refuses a count change that names %s', (_name, target) => {
  const ctx = setupTest();

  expect(spendSetCountInputSchema.safeParse({ ...target, ...ctx.count }).success).toBe(false);
});
