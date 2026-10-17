import { expect, test } from 'bun:test';
import { buildMockModelsConfig } from './build-mock-models-config';

test('it builds a default models config', () => {
  const config = buildMockModelsConfig();
  const [id = 'none'] = Object.keys(config.profiles);

  expect(config).toStrictEqual({
    profiles: {
      [id]: {
        id,
        baseURL: expect.toStartWith('https://'),
        credential: expect.toStartWith('deployment:'),
        authHeader: 'x-api-key',
        model: expect.toBeString(),
        effort: 'medium',
        providerPin: null,
        contextTokens: null,
        cacheTTL: '5m',
        prices: null,
      },
    },
    roles: { conversation: id },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockModelsConfig({
      profiles: { 'chat-direct': { model: 'claude-test-1' }, background: {} },
      roles: { checker: 'background' },
    }),
  ).toMatchObject({
    profiles: {
      'chat-direct': { id: 'chat-direct', model: 'claude-test-1' },
      background: { id: 'background' },
    },
    roles: { conversation: 'chat-direct', checker: 'background' },
  });
});

test('it builds each profile it is given from the full profile defaults', () => {
  expect(
    buildMockModelsConfig({ profiles: { chat: { model: 'claude-test-1' } } }).profiles,
  ).toStrictEqual({
    chat: {
      id: 'chat',
      baseURL: expect.toStartWith('https://'),
      credential: expect.toStartWith('deployment:'),
      authHeader: 'x-api-key',
      model: 'claude-test-1',
      effort: 'medium',
      providerPin: null,
      contextTokens: null,
      cacheTTL: '5m',
      prices: null,
    },
  });
});
