import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDeploymentConfig } from '../load-deployment-config';
import { loadSandboxManifest } from '../load-sandbox-manifest';
import { loadSecrets } from '../load-secrets';
import { writeBootFiles } from './write-boot-files';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-boot-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it writes a configuration that loads, with the scripted model as the conversation', async () => {
  const ctx = await setupTest();
  const files = await writeBootFiles(ctx.dir, 'http://127.0.0.1:4010', { config: [], secrets: [] });
  const config = await loadDeploymentConfig(files.configPath);

  expect(config.server).toStrictEqual({
    dataDir: join(ctx.dir, 'data'),
    hostname: '127.0.0.1',
    port: 0,
    secretsFile: join(ctx.dir, 'secrets.yaml'),
  });

  expect(config.models.profiles['scripted']?.baseURL).toBe('http://127.0.0.1:4010');
});

test('it writes secrets that its sops stand-in decrypts, with the key it returns', async () => {
  const ctx = await setupTest();
  const files = await writeBootFiles(ctx.dir, 'http://127.0.0.1:4010', { config: [], secrets: [] });

  const secrets = await loadSecrets({
    path: join(ctx.dir, 'secrets.yaml'),
    sopsArgv: [files.sopsPath],
  });

  const text = await readFile(join(ctx.dir, 'secrets.yaml'), 'utf8');

  expect(secrets.models).toStrictEqual({ model_credentials: { scripted: 'scripted-model-key' } });
  expect(text).toInclude(`deployment_key: ${files.deploymentKey}`);
});

test('it writes a sandbox manifest that loads', async () => {
  const ctx = await setupTest();
  const files = await writeBootFiles(ctx.dir, 'http://127.0.0.1:4010', { config: [], secrets: [] });
  const images = await loadSandboxManifest(files.manifestPath);

  expect(images.fetch.name).toBe('nixie-fetch-ffffffffffff');
});

test('it appends the extra lines to the configuration', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.dir, 'http://127.0.0.1:4010', {
    config: ['tasks:', '  runners: 5'],
    secrets: [],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.tasks).toStrictEqual({ runners: 5 });
});

test('it appends the extra lines to the secrets file', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.dir, 'http://127.0.0.1:4010', {
    config: [],
    secrets: ['settings:', '  owner_name: Wren Halloway'],
  });

  const secrets = await loadSecrets({
    path: join(ctx.dir, 'secrets.yaml'),
    sopsArgv: [files.sopsPath],
  });

  expect(secrets.settings).toStrictEqual({ owner_name: 'Wren Halloway' });
});
