import { expect, test } from 'bun:test';
import { buildMockModelProfile } from '@heynixie/models/test-utils';
import { buildRoutedModel } from './build-routed-model';

test('it puts the sandbox name and the profile ID after the base URL of both profiles when routed', () => {
  const profile = buildMockModelProfile({ id: 'opus', baseURL: 'https://models.example.test' });

  const routed = buildRoutedModel({
    isRouted: true,
    profile: { profile, credential: null },
    turnProfile: {
      harness: 'agent-sdk',
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'low',
      authHeader: 'x-api-key',
      contextTokens: null,
      cacheTTL: '5m',
      requestRewrite: null,
    },
    sandboxName: 'nixie-abc',
  });

  expect([routed.profile.profile.baseURL, routed.turnProfile.baseURL]).toStrictEqual([
    'https://models.example.test/nixie-abc/opus',
    'https://models.example.test/nixie-abc/opus',
  ]);
});

test('it keeps both profiles as they are when not routed', () => {
  const profile = { profile: buildMockModelProfile({ id: 'opus' }), credential: null };

  const turnProfile = {
    harness: 'agent-sdk',
    model: 'claude-test-1',
    baseURL: 'https://other.example.test',
    effort: 'low',
    authHeader: 'x-api-key',
    contextTokens: null,
    cacheTTL: '5m',
    requestRewrite: null,
  } as const;

  expect(
    buildRoutedModel({ isRouted: false, profile, turnProfile, sandboxName: 'nixie-abc' }),
  ).toStrictEqual({
    profile,
    turnProfile,
  });
});
