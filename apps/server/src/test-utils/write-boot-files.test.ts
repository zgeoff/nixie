import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDeploymentConfig } from '../load-deployment-config';
import { loadSandboxManifest } from '../load-sandbox-manifest';
import { loadSecrets } from '../load-secrets';
import { writeBootFiles } from './write-boot-files';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-boot-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes a configuration that loads, with the scripted model as the conversation', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.server).toStrictEqual({
    dataDir: join(ctx.directory, 'data'),
    hostname: '127.0.0.1',
    port: 0,
    secretsFile: join(ctx.directory, 'secrets.yaml'),
    logLevel: 'info',
  });

  expect(config.models.profiles['scripted']?.baseURL).toBe('http://127.0.0.1:4010');
});

test('it gives each role the model it names', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    roleModelURLs: { 'memory-writer': 'http://127.0.0.1:4020', checker: 'http://127.0.0.1:4030' },
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.models.roles).toMatchObject({
    'memory-writer': 'scripted-memory-writer',
    checker: 'scripted-checker',
  });

  expect(config.models.profiles['scripted-memory-writer']?.baseURL).toBe('http://127.0.0.1:4020');
  expect(config.models.profiles['scripted-checker']?.baseURL).toBe('http://127.0.0.1:4030');
});

test('it writes secrets that its sops stand-in decrypts, with the key it returns', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const secrets = await loadSecrets({
    path: join(ctx.directory, 'secrets.yaml'),
    sopsArgv: [files.sopsPath],
  });

  const text = await readFile(join(ctx.directory, 'secrets.yaml'), 'utf8');

  expect(secrets.models).toStrictEqual({ model_credentials: { scripted: 'scripted-model-key' } });
  expect(text).toInclude(`deployment_key: ${files.deploymentKey}`);
});

test('it writes a sandbox manifest that loads', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const images = await loadSandboxManifest(files.manifestPath);

  expect(images.fetch.name).toBe('nixie-fetch-ffffffffffff');
});

test('it appends the extra lines to the configuration', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['tasks:', '  runners: 5'],
    secrets: [],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.tasks).toStrictEqual({ runners: 5 });
});

test('it writes the log level into the server section', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    logLevel: 'error',
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.server.logLevel).toBe('error');
});

test('it selects the test sandbox when no adapter is named', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.sandbox).toStrictEqual({ adapter: 'test' });
});

test('it writes the extra definitions lines under the definitions section', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    definitions: ['export: { repository: harbour/definitions }'],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.definitions.export).toStrictEqual({
    repository: 'harbour/definitions',
    base: 'main',
    apiURL: 'https://api.github.com',
    title: null,
    message: null,
  });
});

test('it selects the adapter it names', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    sandboxAdapter: 'imp',
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.sandbox).toStrictEqual({ adapter: 'imp' });
});

test('it appends the extra lines to the secrets file', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: ['settings:', '  owner_name: Wren Halloway'],
  });

  const secrets = await loadSecrets({
    path: join(ctx.directory, 'secrets.yaml'),
    sopsArgv: [files.sopsPath],
  });

  expect(secrets.settings).toStrictEqual({ owner_name: 'Wren Halloway' });
});
