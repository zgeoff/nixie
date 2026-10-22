import { expect, test } from 'bun:test';
import { findProxyEndpoint } from './find-proxy-endpoint';

test.each([
  ['POST', '/v1/messages', 'messages'],
  ['POST', '/v1/messages/count_tokens', 'count_tokens'],
  ['GET', '/v1/models', 'models'],
  ['GET', '/v1/models/model-small', 'models'],
])('it finds %s %s as the %s endpoint', (method, path, name) => {
  expect(findProxyEndpoint(method, path)).toMatchObject({ name, method });
});

test.each([
  ['POST', '/v1/messages/batches'],
  ['GET', '/v1/messages'],
  ['POST', '/v1/models'],
  ['GET', '/v1/models/model-small/extra'],
  ['POST', '/v1/files'],
  ['POST', '/v1/messages/'],
])('it finds no endpoint for %s %s', (method, path) => {
  expect(findProxyEndpoint(method, path)).toBeNull();
});

test('it reads a message body that names its model', () => {
  const result = findProxyEndpoint('POST', '/v1/messages')?.body?.safeParse({
    model: 'model-small',
    messages: [],
  });

  expect(result?.data).toStrictEqual({ model: 'model-small', messages: [] });
});

test('it refuses a message body with no model', () => {
  const result = findProxyEndpoint('POST', '/v1/messages')?.body?.safeParse({ messages: [] });

  expect(result?.error?.issues).toPartiallyContain({ path: ['model'] });
});

test('it reads no body for the model list', () => {
  expect(findProxyEndpoint('GET', '/v1/models')?.body).toBeNull();
});
