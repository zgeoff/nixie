import { expect, test } from 'bun:test';
import { buildMockModelsConfig } from './build-mock-models-config';

test('it builds a default models config', () => {
  const config = buildMockModelsConfig();
  const [id = 'none'] = Object.keys(config.profiles);

  expect(config).toStrictEqual({
    profiles: {
      [id]: {
        id,
        harness: 'agent-sdk',
        baseURL: expect.toStartWith('https://'),
        credential: expect.toStartWith('deployment:'),
        authHeader: 'x-api-key',
        model: expect.toBeString(),
        effort: 'medium',
        outsideClaude: null,
        providerPin: null,
        contextTokens: null,
        cacheTTL: '5m',
        prices: null,
      },
    },
    roles: { conversation: id },
    selectable: [],
    limits: {
      taskRun: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
      workerRun: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
      day: { turns: 1000, turnCap: 2000 },
      month: { turns: 20_000 },
    },
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
      harness: 'agent-sdk',
      baseURL: expect.toStartWith('https://'),
      credential: expect.toStartWith('deployment:'),
      authHeader: 'x-api-key',
      model: 'claude-test-1',
      effort: 'medium',
      outsideClaude: null,
      providerPin: null,
      contextTokens: null,
      cacheTTL: '5m',
      prices: null,
    },
  });
});
