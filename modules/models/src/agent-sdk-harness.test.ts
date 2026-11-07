import { expect, test } from 'bun:test';
import { agentSDKHarness } from './agent-sdk-harness';
import { buildMockModelProfile } from './test-utils/build-mock-model-profile';

test.each([
  ['bearer', { ANTHROPIC_AUTH_TOKEN: 'nixie-broker-placeholder' }],
  ['x-api-key', { ANTHROPIC_API_KEY: 'nixie-broker-placeholder' }],
] as const)('#buildGrant puts a placeholder where the CLI reads a %s credential', (header, env) => {
  expect(
    agentSDKHarness.buildGrant({
      name: 'model-chat-1',
      value: 'not-a-real-key',
      host: 'api.anthropic.com',
      header,
    }),
  ).toStrictEqual({ secret: 'model-chat-1', host: 'api.anthropic.com', env });
});

test('#toTurnProfile gives the guest the profile with no credential reference and no prices', () => {
  const profile = buildMockModelProfile({
    model: 'claude-test-1',
    baseURL: 'https://models.example.test',
    effort: 'high',
    authHeader: 'bearer',
    contextTokens: 400_000,
    cacheTTL: '1h',
  });

  expect(agentSDKHarness.toTurnProfile(profile)).toStrictEqual({
    harness: 'agent-sdk',
    model: 'claude-test-1',
    baseURL: 'https://models.example.test',
    effort: 'high',
    authHeader: 'bearer',
    contextTokens: 400_000,
    cacheTTL: '1h',
  });
});

test('#listSessionFiles names the transcript first and the folder of its tool files after it', () => {
  expect(
    agentSDKHarness.listSessionFiles?.({
      harness: 'agent-sdk',
      sessionID: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8',
      messageID: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  ).toStrictEqual([
    '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8.jsonl',
    '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8/',
  ]);
});
