import { expect, test } from 'bun:test';
import { buildMockModelProfile } from './build-mock-model-profile';

test('it builds a default model profile', () => {
  expect(buildMockModelProfile()).toStrictEqual({
    id: expect.toBeString(),
    baseURL: expect.toStartWith('https://'),
    credential: expect.toStartWith('deployment:'),
    authHeader: 'x-api-key',
    model: expect.toBeString(),
    effort: 'medium',
    providerPin: null,
    contextTokens: null,
    cacheTTL: '5m',
    prices: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockModelProfile({ id: 'chat', authHeader: 'bearer' })).toStrictEqual({
    id: 'chat',
    baseURL: expect.toStartWith('https://'),
    credential: expect.toStartWith('deployment:'),
    authHeader: 'bearer',
    model: expect.toBeString(),
    effort: 'medium',
    providerPin: null,
    contextTokens: null,
    cacheTTL: '5m',
    prices: null,
  });
});
