import { expect, test } from 'bun:test';
import { findProxyEndpoint } from './find-proxy-endpoint';

test.each([
  {
    api: 'anthropic-messages',
    method: 'POST',
    path: '/v1/messages',
    name: 'messages',
    spends: true,
  },
  {
    api: 'anthropic-messages',
    method: 'POST',
    path: '/v1/messages/count_tokens',
    name: 'count_tokens',
    spends: false,
  },
  { api: 'anthropic-messages', method: 'GET', path: '/v1/models', name: 'models', spends: false },
  {
    api: 'anthropic-messages',
    method: 'GET',
    path: '/v1/models/model-small',
    name: 'models',
    spends: false,
  },
  {
    api: 'openai-responses',
    method: 'POST',
    path: '/v1/responses',
    name: 'responses',
    spends: true,
  },
  { api: 'openai-responses', method: 'GET', path: '/v1/models', name: 'models', spends: false },
] as const)(
  "it finds a $api route's $method $path as the $name endpoint, which spends: $spends",
  (row) => {
    expect(findProxyEndpoint(row.api, row.method, row.path)).toStrictEqual(
      expect.objectContaining({ name: row.name, spends: row.spends }),
    );
  },
);

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
] as const)('it finds no endpoint on a %s route for %s %s', (api, method, path) => {
  expect(findProxyEndpoint(api, method, path)).toBeNull();
});

test('it reads a message body that names its model', () => {
  const result = findProxyEndpoint(
    'anthropic-messages',
    'POST',
    '/v1/messages',
  )?.body?.schema.safeParse({
    model: 'model-small',
    messages: [],
  });

  expect(result).toStrictEqual(
    expect.objectContaining({ success: true, data: { model: 'model-small', messages: [] } }),
  );
});

test('it refuses a message body with no model', () => {
  const result = findProxyEndpoint(
    'anthropic-messages',
    'POST',
    '/v1/messages',
  )?.body?.schema.safeParse({
    messages: [],
  });

  expect(result?.error?.issues).toPartiallyContain({ path: ['model'] });
});

test('it refuses a Responses body with no model', () => {
  const result = findProxyEndpoint(
    'openai-responses',
    'POST',
    '/v1/responses',
  )?.body?.schema.safeParse({
    input: 'Hi.',
  });

  expect(result?.error?.issues).toPartiallyContain({ path: ['model'] });
});

test('it refuses a Responses body that asks for a background response', () => {
  const result = findProxyEndpoint(
    'openai-responses',
    'POST',
    '/v1/responses',
  )?.body?.schema.safeParse({
    model: 'model-o',
    input: 'Hi.',
    background: true,
  });

  expect(result?.success).toBeFalse();
});

test('it reads no body for the model list', () => {
  expect(findProxyEndpoint('anthropic-messages', 'GET', '/v1/models')?.body).toBeNull();
});
