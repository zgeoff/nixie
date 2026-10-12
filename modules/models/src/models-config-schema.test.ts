import { expect, test } from 'bun:test';
import { modelsConfigSchema } from './models-config-schema';

test('it reads a direct profile with its context tokens and prices into its typed shape', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        context_tokens: 400_000,
        prices: { input: 3, cache_write: 3.75, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.data).toStrictEqual({
    profiles: {
      'chat-direct': {
        id: 'chat-direct',
        baseURL: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        authHeader: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        providerPin: null,
        contextTokens: 400_000,
        prices: { input: 3, cacheWrite: 3.75, cachedInput: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
  });
});

test('it reads an aggregator profile with its provider pin and the role map into their typed shape', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'background-aggregator': {
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'glm-5.3',
        effort: 'low',
        provider_pin: 'z-ai',
      },
    },
    roles: { conversation: 'background-aggregator', 'memory-writer': 'background-aggregator' },
  });

  expect(result.data).toStrictEqual({
    profiles: {
      'background-aggregator': {
        id: 'background-aggregator',
        baseURL: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        authHeader: 'bearer',
        model: 'glm-5.3',
        effort: 'low',
        providerPin: 'z-ai',
        contextTokens: null,
        prices: null,
      },
    },
    roles: { conversation: 'background-aggregator', 'memory-writer': 'background-aggregator' },
  });
});

test.each([
  ['zero', 0],
  ['a negative count', -400_000],
  ['a fraction', 400_000.5],
  ['a string', '400000'],
  ['a count below the CLI minimum', 99_999],
  ['a count above the CLI maximum', 1_000_001],
])('it refuses %s as the context tokens', (_label, contextTokens) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        context_tokens: contextTokens,
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'context_tokens'],
  });
});

test('it refuses a config with the conversation role unset', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { task: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'conversation'],
    message: 'the conversation role is unset, and nixie needs it to start',
  });
});

test('it refuses a role that names no profile', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct', worker: 'chat-missing' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['roles', 'worker'] });
});

test('it refuses a credential reference outside the secrets file', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'vault:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'credential'],
  });
});

test('it refuses an unknown key, so a typo never passes as a default', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        efort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['profiles', 'chat-direct'] });
});
