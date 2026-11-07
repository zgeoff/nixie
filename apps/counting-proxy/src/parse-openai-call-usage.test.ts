import { expect, test } from 'bun:test';
import { parseOpenAICallUsage } from './parse-openai-call-usage';

test('it takes the cache reads and the cache writes out of the input count, and keeps the reasoning tokens', () => {
  expect(
    parseOpenAICallUsage({
      input_tokens: 12_000,
      output_tokens: 900,
      total_tokens: 12_900,
      input_tokens_details: {
        cached_tokens: 4000,
        cache_write_tokens: 7000,
        cache_write_tokens_details: { ttl_30m_tokens: 5000, ttl_12h_tokens: 2000 },
      },
      output_tokens_details: { reasoning_tokens: 600 },
    }),
  ).toStrictEqual({
    uncachedInputTokens: 1000,
    cacheReadTokens: 4000,
    cacheWrite5mTokens: 5000,
    cacheWrite1hTokens: 2000,
    outputTokens: 900,
    reasoningTokens: 600,
  });
});

test.each([
  ['a reply that leaves out the split', { cache_write_tokens: 3000 }, 0, 3000],
  [
    'a reply whose split leaves writes unreported',
    {
      cache_write_tokens: 3000,
      cache_write_tokens_details: { ttl_30m_tokens: 1000, ttl_12h_tokens: 0 },
    },
    1000,
    2000,
  ],
])(
  'it counts each cache write with no lifetime at the longer lifetime for %s',
  (_case, details, cacheWrite5mTokens, cacheWrite1hTokens) => {
    expect(
      parseOpenAICallUsage({
        input_tokens: 5000,
        output_tokens: 10,
        input_tokens_details: { cached_tokens: 0, ...details },
      }),
    ).toStrictEqual({
      uncachedInputTokens: 2000,
      cacheReadTokens: 0,
      cacheWrite5mTokens,
      cacheWrite1hTokens,
      outputTokens: 10,
    });
  },
);

test('it counts the split of cache writes when the split reports more than the total', () => {
  expect(
    parseOpenAICallUsage({
      input_tokens: 5000,
      output_tokens: 10,
      input_tokens_details: {
        cached_tokens: 0,
        cache_write_tokens: 1000,
        cache_write_tokens_details: { ttl_30m_tokens: 1000, ttl_12h_tokens: 2000 },
      },
    }),
  ).toStrictEqual({
    uncachedInputTokens: 2000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 1000,
    cacheWrite1hTokens: 2000,
    outputTokens: 10,
  });
});

test('it reads a reply with no token details as uncached input and output', () => {
  expect(parseOpenAICallUsage({ input_tokens: 300, output_tokens: 20 })).toStrictEqual({
    uncachedInputTokens: 300,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 20,
  });
});

test.each([
  ['no value', null],
  ['an empty object', {}],
  ['a negative count', { input_tokens: -1, output_tokens: 5 }],
  ['a count that is text', { input_tokens: '40', output_tokens: 5 }],
])('it reads %s as no usage', (_case, usage) => {
  expect(parseOpenAICallUsage(usage)).toBeNull();
});
