import { expect, test } from 'bun:test';
import { parseAnthropicCallUsage } from './parse-anthropic-call-usage';

test('it reads a mixed call with its cache writes split by lifetime', () => {
  expect(
    parseAnthropicCallUsage({
      input_tokens: 10,
      output_tokens: 200,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 50_000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    }),
  ).toStrictEqual({
    uncachedInputTokens: 10,
    cacheReadTokens: 50_000,
    cacheWrite5mTokens: 1000,
    cacheWrite1hTokens: 2000,
    outputTokens: 200,
  });
});

test.each([
  ['a call that leaves out the split', { cache_creation_input_tokens: 3000 }, 0, 3000],
  [
    'a call whose split leaves writes unreported',
    { cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 1000 } },
    1000,
    2000,
  ],
  [
    'a call whose split reports more writes than the total',
    {
      cache_creation_input_tokens: 1000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
    1000,
    2000,
  ],
])(
  'it counts each cache write with no lifetime as a 1-hour write for %s',
  (_case, usage, cacheWrite5mTokens, cacheWrite1hTokens) => {
    expect(parseAnthropicCallUsage({ input_tokens: 0, output_tokens: 0, ...usage })).toStrictEqual({
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens,
      cacheWrite1hTokens,
      outputTokens: 0,
    });
  },
);

test('it reads a missing count as zero when another count is present', () => {
  expect(parseAnthropicCallUsage({ output_tokens: 12, service_tier: 'standard' })).toStrictEqual({
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 12,
  });
});

test.each([
  ['no value', null],
  ['an empty object', {}],
  ['a negative count', { input_tokens: -1, output_tokens: 5 }],
  ['a count that is text', { input_tokens: '40', output_tokens: 5 }],
])('it reads %s as no usage', (_case, usage) => {
  expect(parseAnthropicCallUsage(usage)).toBeNull();
});
