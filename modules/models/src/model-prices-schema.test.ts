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

test('it reads the long-prompt rates and the prompt length they start above', () => {
  const result = modelPricesSchema.safeParse({
    input: 0.1,
    cache_write: 0.125,
    cache_write_1h: 0.2,
    cached_input: 0.01,
    output: 0.5,
    long_prompt: {
      over_tokens: 100_000,
      input: 0.5,
      cache_write: 0.625,
      cache_write_1h: 1,
      cached_input: 0.05,
      output: 2.5,
    },
  });

  expect(result.data).toStrictEqual({
    input: 0.1,
    cacheWrite: 0.125,
    cacheWrite1h: 0.2,
    cachedInput: 0.01,
    output: 0.5,
    longPrompt: {
      overTokens: 100_000,
      input: 0.5,
      cacheWrite: 0.625,
      cacheWrite1h: 1,
      cachedInput: 0.05,
      output: 2.5,
    },
  });
});

test('it rejects long-prompt rates that leave out the output price', () => {
  const result = modelPricesSchema.safeParse({
    input: 0.1,
    cache_write: 0.125,
    cache_write_1h: 0.2,
    cached_input: 0.01,
    output: 0.5,
    long_prompt: {
      over_tokens: 100_000,
      input: 0.5,
      cache_write: 0.625,
      cache_write_1h: 1,
      cached_input: 0.05,
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['long_prompt', 'output'] });
});

test('it rejects long-prompt rates whose prompt length is not a whole number of tokens', () => {
  const result = modelPricesSchema.safeParse({
    input: 0.1,
    cache_write: 0.125,
    cache_write_1h: 0.2,
    cached_input: 0.01,
    output: 0.5,
    long_prompt: {
      over_tokens: 100_000.5,
      input: 0.5,
      cache_write: 0.625,
      cache_write_1h: 1,
      cached_input: 0.05,
      output: 2.5,
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['long_prompt', 'over_tokens'] });
});

test('it rejects a field the price table does not know', () => {
  const result = modelPricesSchema.safeParse({
    input: 0.1,
    cache_write: 0.125,
    cache_write_1h: 0.2,
    cached_input: 0.01,
    output: 0.5,
    long_prompt_over: 100_000,
  });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
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
