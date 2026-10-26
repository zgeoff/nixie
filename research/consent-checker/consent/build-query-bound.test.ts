import { expect, test } from 'bun:test';
import { buildQueryBoundUSD } from './build-query-bound.ts';

test.each([
  ['claude-sonnet-5-5', 1_749_216],
  ['claude-opus-5-5', 3_498_432],
])(
  'it bounds 3 requests of %s at 32,000 output tokens and an input that grows by one output and the overhead',
  (model, boundMicroUSD) => {
    expect(Math.round(buildQueryBoundUSD(model, 1000) * 1_000_000)).toBe(boundMicroUSD);
  },
);

test('it bounds a larger prompt above a smaller one', () => {
  const small = buildQueryBoundUSD('claude-sonnet-5-5', 1000);
  const large = buildQueryBoundUSD('claude-sonnet-5-5', 50_000);

  expect(large).toBeGreaterThan(small);
});

test('it refuses a model it knows no price for', () => {
  expect(() => buildQueryBoundUSD('claude-unknown', 1000)).toThrow(
    'no price is known for claude-unknown, so no reservation can hold what its calls cost',
  );
});
