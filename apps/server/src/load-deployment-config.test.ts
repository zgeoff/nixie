import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDeploymentConfig } from './load-deployment-config';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-config-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'config.yaml') };
}

test('it reads the model profiles and the role map from the file', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '  roles:',
      '    conversation: chat-direct',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config).toStrictEqual({
    models: {
      profiles: {
        'chat-direct': {
          id: 'chat-direct',
          baseURL: 'https://api.anthropic.com',
          credential: 'deployment:anthropic',
          authHeader: 'x-api-key',
          model: 'claude-test-1',
          effort: 'medium',
          providerPin: null,
          prices: null,
        },
      },
      roles: { conversation: 'chat-direct' },
    },
  });
});

test('it refuses to start with the conversation role unset', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '  roles:',
      '    task: chat-direct',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\nmodels.roles.conversation: the conversation role is unset, and nixie needs it to start`,
  );
});

test('it refuses a key no module reads', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '  roles:',
      '    conversation: chat-direct',
      'modles: {}',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow('Unrecognized key: "modles"');
});
