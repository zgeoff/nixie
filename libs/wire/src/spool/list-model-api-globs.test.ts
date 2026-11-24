import { expect, test } from 'bun:test';
import { listModelAPIGlobs } from './list-model-api-globs';

test('it lists the Anthropic API paths at the root', () => {
  expect(listModelAPIGlobs('anthropic-messages', '/')).toStrictEqual([
    '/v1/messages',
    '/v1/messages/count_tokens',
    '/v1/models',
    '/v1/models/*',
  ]);
});

test('it lists the OpenAI API paths under a base path without its trailing slash', () => {
  expect(listModelAPIGlobs('openai-responses', '/proxy/')).toStrictEqual([
    '/proxy/v1/responses',
    '/proxy/responses',
    '/proxy/v1/models',
    '/proxy/v1/models/*',
  ]);
});
