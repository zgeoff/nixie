import { expect, test } from 'bun:test';
import { parseReportedUsage } from './parse-reported-usage';

test('it reads a whole usage block', () => {
  expect(
    parseReportedUsage({
      input_tokens: 40,
      output_tokens: 12,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 800,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
      service_tier: 'standard',
    }),
  ).toStrictEqual({
    input_tokens: 40,
    output_tokens: 12,
    cache_creation_input_tokens: 3000,
    cache_read_input_tokens: 800,
    cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
  });
});

test('it reads a missing count as zero when another count is present', () => {
  expect(parseReportedUsage({ output_tokens: 12 })).toStrictEqual({
    input_tokens: 0,
    output_tokens: 12,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
  });
});

test.each([
  ['no value', null],
  ['an empty object', {}],
  ['a negative count', { input_tokens: -1, output_tokens: 5 }],
  ['a count that is text', { input_tokens: '40', output_tokens: 5 }],
])('it reads %s as no usage', (_label, value) => {
  expect(parseReportedUsage(value)).toBeNull();
});
