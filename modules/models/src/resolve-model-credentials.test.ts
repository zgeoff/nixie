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

test('it resolves a profile whose entry the secrets file lacks to no credential', () => {
  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:anthropic' } },
  });

  const resolved = resolveModelCredentials(config, {
    model_credentials: { gateway: 'not-a-real-token' },
  });

  expect(resolved['chat']?.credential).toBeNull();
});

test('it resolves every profile to no credential when the secrets file has no model_credentials', () => {
  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:anthropic' } },
  });

  const resolved = resolveModelCredentials(config, {});

  expect(resolved['chat']?.credential).toBeNull();
});
