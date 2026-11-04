import { expect, onTestFinished, test } from 'bun:test';
import { deriveModelSecret, resolveModelCredentials } from '@heynixie/models';
import { buildImpPort, buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { TEST_TOKEN, startTestImpd } from '@impz/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const impd = await startTestImpd();

  onTestFinished(impd.stop);

  const recorder = await setupTestRecorder();

  return {
    impd,
    adapter: buildImpSandboxAdapter({
      port: buildImpPort({ url: impd.url, token: TEST_TOKEN }),
      recorder: recorder.recorder,
      config: { publicEgress: null },
      toolTarget: () => ({ path: '/nonexistent/tools.sock' }),
    }),
  };
}

test('it uses the secret impd holds under the fixed name of a profile with no credential in the secrets file', async () => {
  const ctx = await setupTest();

  await ctx.impd.client.secrets.add({
    name: 'nixie-model-528d8dae09a6d4f1e0e',
    kind: 'custom',
    value: 'not-a-real-key',
    rules: [{ host: 'api.anthropic.com', header: 'authorization', scheme: 'bearer' }],
  });

  const resolved = resolveModelCredentials(
    {
      profiles: {
        opus: {
          id: 'opus',
          baseURL: 'https://api.anthropic.com',
          credential: 'deployment:anthropic',
          authHeader: 'bearer',
          model: 'claude-opus-5-5',
          effort: 'high',
          providerPin: null,
          contextTokens: null,
          cacheTTL: '5m',
          prices: null,
        },
      },
      roles: { conversation: 'opus' },
    },
    {},
  );

  const opus = resolved['opus'];

  invariant(opus);

  await ctx.adapter.addSecret(deriveModelSecret(opus));

  const secrets = await ctx.impd.client.secrets.list();

  expect(secrets.map((secret) => secret.name)).toStrictEqual(['nixie-model-528d8dae09a6d4f1e0e']);
});

test('it refuses the fixed-name secret of a profile with no credential in the secrets file when impd lacks it', async () => {
  const ctx = await setupTest();

  const resolved = resolveModelCredentials(
    {
      profiles: {
        opus: {
          id: 'opus',
          baseURL: 'https://api.anthropic.com',
          credential: 'deployment:anthropic',
          authHeader: 'bearer',
          model: 'claude-opus-5-5',
          effort: 'high',
          providerPin: null,
          contextTokens: null,
          cacheTTL: '5m',
          prices: null,
        },
      },
      roles: { conversation: 'opus' },
    },
    {},
  );

  const opus = resolved['opus'];

  invariant(opus);

  expect(ctx.adapter.addSecret(deriveModelSecret(opus))).rejects.toThrow(
    'impd holds no secret nixie-model-528d8dae09a6d4f1e0e, and nixie holds no credential to add it under that name',
  );
});
