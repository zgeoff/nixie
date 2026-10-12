import { expect, test } from 'bun:test';
import { resolveModelCredentials } from './resolve-model-credentials';
import { buildMockModelsConfig } from './test-utils/build-mock-models-config';

test('it resolves each profile credential from the model_credentials entry its reference names', () => {
  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:anthropic' } },
  });

  const resolved = resolveModelCredentials(config, {
    model_credentials: { anthropic: 'not-a-real-key' },
  });

  expect(resolved['chat']?.credential).toBe('not-a-real-key');
});

test('it refuses a profile whose entry the secrets file lacks', () => {
  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:anthropic' } },
  });

  expect(() =>
    resolveModelCredentials(config, { model_credentials: { gateway: 'not-a-real-token' } }),
  ).toThrowWithMessage(
    Error,
    'the profile chat names the credential deployment:anthropic, and the secrets file has no model_credentials entry anthropic',
  );
});
