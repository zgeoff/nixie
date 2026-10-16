import { expect, test } from 'bun:test';
import { buildTestModelsConfig } from './build-test-models-config';

test('it builds a conversation role on one profile at the model URL, with no context window', () => {
  expect(buildTestModelsConfig({ modelURL: 'http://127.0.0.1:4100' })).toStrictEqual({
    profiles: {
      'chat-direct': {
        id: 'chat-direct',
        baseURL: 'http://127.0.0.1:4100',
        credential: 'deployment:anthropic',
        authHeader: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
        providerPin: null,
        contextTokens: null,
        cacheTTL: '5m',
        prices: null,
      },
    },
    roles: { conversation: 'chat-direct' },
  });
});

test('it sets the profile context window that the options give', () => {
  expect(
    buildTestModelsConfig({ modelURL: 'http://127.0.0.1:4100', contextTokens: 100_000 }),
  ).toMatchObject({ profiles: { 'chat-direct': { contextTokens: 100_000 } } });
});
