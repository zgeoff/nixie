import { expect, test } from 'bun:test';
import { modelsConfigSchema } from '../models-config-schema';
import { buildMockModelsConfig } from './build-mock-models-config';

test('it builds a default models config', () => {
  expect(buildMockModelsConfig()).toStrictEqual(
    modelsConfigSchema.parse({
      profiles: {
        'chat-direct': {
          base_url: 'https://api.anthropic.com',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'medium',
        },
        'chat-aggregator': {
          base_url: 'https://gateway.example/anthropic',
          credential: 'deployment:gateway',
          auth_header: 'bearer',
          model: 'glm-5.3',
          effort: 'high',
        },
      },
      roles: { conversation: 'chat-direct' },
    }),
  );
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockModelsConfig({ roles: { conversation: 'chat-aggregator' } })).toMatchObject({
    profiles: { 'chat-direct': { model: 'claude-test-1' } },
    roles: { conversation: 'chat-aggregator' },
  });
});
