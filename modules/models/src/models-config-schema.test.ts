import { expect, test } from 'bun:test';
import { modelsConfigSchema } from './models-config-schema';

test('it reads a direct profile with its context tokens, cache lifetime and prices into its typed shape', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'medium',
        context_tokens: 400_000,
        cache_ttl: '1h',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
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
        model: 'claude-sonnet-5-5',
        effort: 'medium',
        providerPin: null,
        contextTokens: 400_000,
        cacheTTL: '1h',
        prices: { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
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
        cacheTTL: '5m',
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

test.each([
  ['claude-haiku-5-5', 200_000],
  ['claude-sonnet-5-5', 1_000_000],
  ['claude-haiku-5-5[1m]', 1_000_000],
  ['anthropic/claude-sonnet-5-5', 400_000],
  ['claude-mythos-preview', 1_000_000],
])('it reads %s with a context cap of %d, within the window the CLI assumes', (model, cap) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model,
        effort: 'medium',
        context_tokens: cap,
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.data?.profiles['chat-direct']).toMatchObject({ model, contextTokens: cap });
});

test('it refuses a context cap larger than the window the CLI assumes for the model', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-haiku-5-5',
        effort: 'medium',
        context_tokens: 200_001,
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'context_tokens'],
    message:
      'the context cap of 200001 tokens is larger than the 200000-token window the Claude CLI assumes for claude-haiku-5-5',
  });
});

test('it refuses a cache lifetime the CLI does not take', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'medium',
        cache_ttl: '30m',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'cache_ttl'],
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

test('it refuses a price table without the 1-hour cache write price', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'prices', 'cache_write_1h'],
  });
});

test('it reads the profile the memory consolidator role names', () => {
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
    roles: { conversation: 'chat-direct', 'memory-consolidator': 'chat-direct' },
  });

  expect(result.data?.roles).toStrictEqual({
    conversation: 'chat-direct',
    'memory-consolidator': 'chat-direct',
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
