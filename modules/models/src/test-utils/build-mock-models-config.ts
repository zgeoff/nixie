import type { ModelsConfig } from '../types';

// Two profiles, a direct one with an API key and an aggregator one with a bearer token, and the
// conversation role on the direct one.
export function buildMockModelsConfig(overrides: Partial<ModelsConfig> = {}): ModelsConfig {
  return {
    profiles: {
      'chat-direct': {
        id: 'chat-direct',
        baseURL: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        authHeader: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        providerPin: null,
        prices: null,
      },
      'chat-aggregator': {
        id: 'chat-aggregator',
        baseURL: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        authHeader: 'bearer',
        model: 'glm-5.3',
        effort: 'high',
        providerPin: null,
        prices: null,
      },
    },
    roles: { conversation: 'chat-direct' },
    ...overrides,
  };
}
