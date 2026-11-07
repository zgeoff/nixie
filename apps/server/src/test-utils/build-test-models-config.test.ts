import { expect, test } from 'bun:test';
import { buildTestModelsConfig } from './build-test-models-config';

test('it builds a conversation role on one profile at the model URL, with no context window', () => {
  expect(buildTestModelsConfig({ modelURL: 'http://127.0.0.1:4100' })).toStrictEqual({
    profiles: {
      'chat-direct': {
        id: 'chat-direct',
        harness: 'agent-sdk',
        baseURL: 'http://127.0.0.1:4100',
        credential: 'deployment:anthropic',
        authHeader: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
        providerPin: null,
        contextTokens: null,
        cacheTTL: '5m',
        prices: { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: [],
    limits: {
      taskRun: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
    },
  });
});

test('it sets the profile context window that the options give', () => {
  expect(
    buildTestModelsConfig({ modelURL: 'http://127.0.0.1:4100', contextTokens: 100_000 }),
  ).toMatchObject({ profiles: { 'chat-direct': { contextTokens: 100_000 } } });
});
