import { expect, test } from 'bun:test';
import { createTestCredentials } from '@heynixie/credentials/test-utils';
import { buildMockModelsConfig } from '../test-utils/build-mock-models-config';
import { resolveModelCredentials } from './resolve-model-credentials';

test('it resolves each profile credential to the model_credentials entry its reference names', async () => {
  const credentials = await createTestCredentials({
    model_credentials: { anthropic: 'not-a-real-key' },
  });

  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:anthropic' } },
  });

  const resolved = resolveModelCredentials(config, credentials.resolveCredential);

  expect(resolved['chat']?.credential).toStrictEqual({
    backend: 'file',
    group: 'model_credentials',
    name: 'anthropic',
  });
});

test('it resolves a profile whose entry the secrets file lacks to no credential', async () => {
  const credentials = await createTestCredentials({
    model_credentials: { gateway: 'not-a-real-token' },
  });

  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:anthropic' } },
  });

  const resolved = resolveModelCredentials(config, credentials.resolveCredential);

  expect(resolved['chat']?.credential).toBeNull();
});

test('it resolves a profile whose reference holds a dot', async () => {
  const credentials = await createTestCredentials({
    model_credentials: { 'router.v2': 'not-a-real-token' },
  });

  const config = buildMockModelsConfig({
    profiles: { chat: { credential: 'deployment:router.v2' } },
  });

  const resolved = resolveModelCredentials(config, credentials.resolveCredential);

  expect(resolved['chat']?.credential).toMatchObject({ name: 'router.v2' });
});
