import { expect, test } from 'bun:test';
import { harnessCapabilities } from '@heynixie/wire';
import { bindHarness } from './bind-harness';
import { buildMockModelProfile } from './test-utils/build-mock-model-profile';

test.each([
  ['bearer', { ANTHROPIC_AUTH_TOKEN: 'nixie-broker-placeholder' }],
  ['x-api-key', { ANTHROPIC_API_KEY: 'nixie-broker-placeholder' }],
] as const)('#buildGrant puts a placeholder where the CLI reads a %s credential', (header, env) => {
  const harness = bindHarness(buildMockModelProfile());

  expect(
    harness.buildGrant({
      name: 'model-chat-1',
      value: 'not-a-real-key',
      host: 'api.anthropic.com',
      header,
    }),
  ).toStrictEqual({ secret: 'model-chat-1', host: 'api.anthropic.com', env });
});

test('it binds the Agent SDK record, which speaks the Anthropic Messages API', () => {
  const harness = bindHarness(buildMockModelProfile());

  expect(harness).toMatchObject({
    id: 'agent-sdk',
    api: 'anthropic-messages',
    guest: { package: 'conversation', entries: { turn: 'main', check: 'check' } },
    imageKey: 'conversation',
    toolUseMetaKey: 'claudecode/toolUseId',
    toolCallWaitMs: null,
    capabilities: harnessCapabilities['agent-sdk'],
  });
});

test.each(['bearer', 'x-api-key'] as const)(
  'it takes the secret header %s from the profile',
  (authHeader) => {
    expect(bindHarness(buildMockModelProfile({ authHeader })).secretHeader).toBe(authHeader);
  },
);

test('it takes the context window from the profile cap', () => {
  expect(bindHarness(buildMockModelProfile({ contextTokens: 400_000 })).contextWindow).toBe(
    400_000,
  );
});

test('it falls back to the window the CLI assumes for the model when the profile sets no cap', () => {
  expect(
    bindHarness(buildMockModelProfile({ model: 'claude-test-1', contextTokens: null }))
      .contextWindow,
  ).toBe(200_000);
});

test('#toTurnProfile gives the guest the profile with no credential reference and no prices', () => {
  const harness = bindHarness(
    buildMockModelProfile({
      model: 'claude-test-1',
      baseURL: 'https://models.example.test',
      effort: 'high',
      authHeader: 'bearer',
      contextTokens: 400_000,
      cacheTTL: '1h',
    }),
  );

  expect(harness.toTurnProfile('kept')).toStrictEqual({
    harness: 'agent-sdk',
    model: 'claude-test-1',
    baseURL: 'https://models.example.test',
    effort: 'high',
    authHeader: 'bearer',
    contextTokens: 400_000,
    cacheTTL: '1h',
  });
});

test('#toTurnProfile sets the 5-minute cache for a one-off session', () => {
  const harness = bindHarness(buildMockModelProfile({ cacheTTL: '1h' }));

  expect(harness.toTurnProfile('one-off').cacheTTL).toBe('5m');
});

test('#session.owns accepts a point of the Agent SDK', () => {
  const harness = bindHarness(buildMockModelProfile());

  expect(
    harness.session?.owns({
      harness: 'agent-sdk',
      sessionID: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8',
      messageID: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  ).toBe(true);
});

test('#session.nameSession names the session by its ID', () => {
  const harness = bindHarness(buildMockModelProfile());

  expect(
    harness.session?.nameSession({
      harness: 'agent-sdk',
      sessionID: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8',
      messageID: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  ).toBe('6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8');
});

test('#session.listFiles names the transcript first and the folder of its tool files after it', () => {
  const harness = bindHarness(buildMockModelProfile());

  expect(
    harness.session?.listFiles({
      harness: 'agent-sdk',
      sessionID: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8',
      messageID: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    }),
  ).toStrictEqual([
    '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8.jsonl',
    '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8/',
  ]);
});
