import { expect, test } from 'bun:test';
import { buildStubCodexProfileSchema } from './build-stub-codex-profile-schema';

test('it parses a codex profile with no prices into a profile that sets none', () => {
  const schema = buildStubCodexProfileSchema();

  const profile = schema.parse({
    harness: 'codex',
    base_url: 'https://models.example.test',
    credential: 'deployment:openai',
    model: 'gpt-test-1',
  });

  expect(profile).toStrictEqual({
    harness: 'codex',
    baseURL: 'https://models.example.test',
    credential: 'deployment:openai',
    authHeader: 'bearer',
    model: 'gpt-test-1',
    effort: 'medium',
    providerPin: null,
    contextTokens: null,
    cacheTTL: '5m',
    prices: null,
  });
});

test('it parses the prices a codex profile sets', () => {
  const schema = buildStubCodexProfileSchema();

  const profile = schema.parse({
    harness: 'codex',
    base_url: 'https://models.example.test',
    credential: 'deployment:openai',
    model: 'gpt-test-1',
    prices: { input: 2, cache_write: 0, cache_write_1h: 0, cached_input: 0.2, output: 8 },
  });

  expect(profile.prices).toStrictEqual({
    input: 2,
    cacheWrite: 0,
    cacheWrite1h: 0,
    cachedInput: 0.2,
    output: 8,
  });
});

test('it refuses a codex profile with a field the stand-in does not take', () => {
  const schema = buildStubCodexProfileSchema();

  const result = schema.safeParse({
    harness: 'codex',
    base_url: 'https://models.example.test',
    credential: 'deployment:openai',
    model: 'gpt-test-1',
    effort: 'high',
  });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});
