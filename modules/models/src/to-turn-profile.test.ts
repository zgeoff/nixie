import { expect, test } from 'bun:test';
import { buildMockModelProfile } from './test-utils/build-mock-model-profile';
import { toTurnProfile } from './to-turn-profile';

test('it gives the guest the profile with no credential reference and no prices', () => {
  const profile = buildMockModelProfile({
    model: 'claude-test-1',
    baseURL: 'https://models.example.test',
    effort: 'high',
    authHeader: 'bearer',
    contextTokens: 400_000,
  });

  expect(toTurnProfile(profile)).toStrictEqual({
    model: 'claude-test-1',
    baseURL: 'https://models.example.test',
    effort: 'high',
    authHeader: 'bearer',
    contextTokens: 400_000,
  });
});
