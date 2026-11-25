import { expect, test } from 'bun:test';
import { buildHostHeldName } from '@heynixie/credentials';
import { buildMockCredentialRef, createTestCredentials } from '@heynixie/credentials/test-utils';
import type { SecretSpec } from '@heynixie/sandbox';
import { buildMockModelProfile } from '../test-utils/build-mock-model-profile';
import { bindHarness } from './bind-harness';
import { grantModelSecret } from './grant-model-secret';

async function setupTest() {
  const credentials = await createTestCredentials({
    model_credentials: { anthropic: 'not-a-real-key-1234' },
  });

  const added: SecretSpec[] = [];

  const profile = buildMockModelProfile({
    id: 'opus',
    baseURL: 'https://api.anthropic.com',
    authHeader: 'bearer',
  });

  return {
    credentials,
    added,
    profile,
    harness: bindHarness(profile),
    sandboxes: { addSecret: (secret: SecretSpec) => Promise.resolve(void added.push(secret)) },
  };
}

test('it grants a credential the sandbox host holds under the name its profile always gave', async () => {
  const ctx = await setupTest();

  const secret = await grantModelSecret({ profile: ctx.profile, credential: null }, ctx.harness, {
    store: ctx.credentials.store,
    sandboxes: ctx.sandboxes,
  });

  expect(secret).toStrictEqual({
    name: buildHostHeldName({ profileID: 'opus', header: 'bearer', host: 'api.anthropic.com' }),
    host: 'api.anthropic.com',
    header: 'bearer',
  });

  expect(ctx.added).toMatchObject([{ value: null }]);
});

test('it grants a credential nixie holds with its reference and keyed fingerprint', async () => {
  const ctx = await setupTest();

  const secret = await grantModelSecret(
    { profile: ctx.profile, credential: buildMockCredentialRef('anthropic') },
    ctx.harness,
    { store: ctx.credentials.store, sandboxes: ctx.sandboxes },
  );

  expect(secret).toStrictEqual({
    name: expect.stringMatching(/^nixie-model-[0-9a-f]{19}$/u),
    host: 'api.anthropic.com',
    header: 'bearer',
    reference: 'deployment:anthropic',
    fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/u),
  });
});

test('it hands the value to the sandbox adapter alone, never to the caller', async () => {
  const ctx = await setupTest();

  const secret = await grantModelSecret(
    { profile: ctx.profile, credential: buildMockCredentialRef('anthropic') },
    ctx.harness,
    { store: ctx.credentials.store, sandboxes: ctx.sandboxes },
  );

  expect(JSON.stringify(secret)).not.toContain('not-a-real-key-1234');
  expect(ctx.added).toMatchObject([{ value: 'not-a-real-key-1234' }]);
});
