import { expect, test } from 'bun:test';
import { modelPricesSchema } from './model-prices-schema';

test('it reads prices into their typed shape, the 1-hour cache write price included', () => {
  const result = modelPricesSchema.safeParse({
    input: 1,
    cache_write: 1.25,
    cache_write_1h: 2,
    cached_input: 0.1,
    output: 5,
  });

  expect(result.data).toStrictEqual({
    input: 1,
    cacheWrite: 1.25,
    cacheWrite1h: 2,
    cachedInput: 0.1,
    output: 5,
  });
});

test('it rejects a negative price', () => {
  const result = modelPricesSchema.safeParse({
    input: 1,
    cache_write: 1.25,
    cache_write_1h: 2,
    cached_input: -0.1,
    output: 5,
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['cached_input'] });
});
