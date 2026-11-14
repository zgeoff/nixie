import { expect, test } from 'bun:test';
import { findModelAPIEndpoint } from './find-model-api-endpoint';

test.each([
  ['anthropic-messages', 'POST', '/v1/messages', 'messages'],
  ['anthropic-messages', 'POST', '/v1/messages/count_tokens', 'count_tokens'],
  ['anthropic-messages', 'GET', '/v1/models', 'models'],
  ['anthropic-messages', 'GET', '/v1/models/model-small', 'models'],
  ['openai-responses', 'POST', '/v1/responses', 'responses'],
  ['openai-responses', 'GET', '/v1/models', 'models'],
] as const)("it finds the %s API's %s %s as its %s endpoint", (api, method, path, name) => {
  expect(findModelAPIEndpoint(api, method, path)).toBe(name);
});

test.each([
  ['anthropic-messages', 'POST', '/v1/messages/batches'],
  ['anthropic-messages', 'GET', '/v1/messages'],
  ['anthropic-messages', 'POST', '/v1/models'],
  ['anthropic-messages', 'GET', '/v1/models/model-small/extra'],
  ['anthropic-messages', 'POST', '/v1/files'],
  ['anthropic-messages', 'POST', '/v1/messages/'],
  ['anthropic-messages', 'POST', '/v1/responses'],
  ['openai-responses', 'POST', '/v1/messages'],
  ['openai-responses', 'GET', '/v1/responses/resp_0a1b2c'],
  ['openai-responses', 'POST', '/v1/responses/input_tokens'],
  ['openai-responses', 'POST', '/v1/chat/completions'],
] as const)('it finds no endpoint of the %s API for %s %s', (api, method, path) => {
  expect(findModelAPIEndpoint(api, method, path)).toBeNull();
});
