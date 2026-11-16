import { expect, test } from 'bun:test';
import { buildMockVariantToolDefinition } from './build-mock-variant-tool-definition';

test.each([
  ['risky', 'risky'],
  ['plain', 'plain'],
  ['other', 'plain'],
])('it picks the %s variant for the kind %s', (kind, picked) => {
  const tool = buildMockVariantToolDefinition();

  expect(tool.variants?.pick({ kind, query: 'a' })).toBe(picked);
});

test('it names the query as content in the risky variant only', () => {
  const tool = buildMockVariantToolDefinition();

  expect([
    tool.variants?.declarations['risky']?.content,
    tool.variants?.declarations['plain']?.content,
  ]).toStrictEqual([['query'], []]);
});
