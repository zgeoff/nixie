import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecrets } from '@heynixie/credentials';
import { loadDeploymentConfig } from '../deployment/load-deployment-config';
import { listFeaturesOn } from '../feature/list-features-on';
import { loadSandboxManifest } from '../sandbox/load-sandbox-manifest';
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
    outageNoticeMinutes: 10,
  });

  expect(config.models.profiles['scripted']?.baseURL).toBe('http://127.0.0.1:4010');
});

test('it gives each role the model it names', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    roleModelURLs: { task: 'http://127.0.0.1:4020', checker: 'http://127.0.0.1:4030' },
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.models.roles).toMatchObject({
    task: 'scripted-task',
    checker: 'scripted-checker',
  });

  expect(config.models.profiles['scripted-task']?.baseURL).toBe('http://127.0.0.1:4020');
  expect(config.models.profiles['scripted-checker']?.baseURL).toBe('http://127.0.0.1:4030');
});

test('it gives each selectable model a priced profile of its own at the URL it names', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    selectableModelURLs: { 'second-look': 'http://127.0.0.1:4050' },
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.models.selectable).toStrictEqual([
    {
      name: 'second-look',
      profile: 'selectable-second-look',
      description: 'The second-look test model',
      isAsked: false,
    },
  ]);

  expect(config.models.profiles['selectable-second-look']).toStrictEqual({
    id: 'selectable-second-look',
    harness: 'agent-sdk',
    baseURL: 'http://127.0.0.1:4050',
    credential: 'deployment:scripted',
    authHeader: 'bearer',
    model: 'claude-second-look-test-model',
    effort: 'low',
    contextTokens: null,
    cacheTTL: '5m',
    outsideClaude: null,
    providerPin: null,
    prices: { input: 1, cacheWrite: 1, cacheWrite1h: 1, cachedInput: 0.1, output: 4 },
  });
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

  expect(
    secrets.resolveCredential({ class: 'model', reference: 'deployment:scripted' }),
  ).toStrictEqual({
    backend: 'file',
    group: 'model_credentials',
    name: 'scripted',
  });

  expect(text).toInclude(`deployment_key: ${files.deploymentKey}`);
});

test('it leaves the model credential out of the secrets file when the sandbox backend holds it', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    modelCredential: 'sandbox-backend',
  });

  const secrets = await loadSecrets({
    path: join(ctx.directory, 'secrets.yaml'),
    sopsArgv: [files.sopsPath],
  });

  expect(secrets.modelCredentialCount).toBe(0);
});

test('it writes a sandbox manifest that loads', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const images = await loadSandboxManifest(files.manifestPath);

  expect(images.fetch?.name).toBe('nixie-fetch-ffffffffffff');
});

test('it appends the extra lines to the configuration', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: ['tasks:', '  runners: 5'],
    secrets: [],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.tasks).toStrictEqual({
    runners: 5,
    startedClaimLoops: 2,
    callClaimLoops: 1,
    messaging: { hopLimit: 20 },
  });
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
    app: null,
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

test('it keeps backups off unless the test asks for them', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.backup).toStrictEqual({ isEnabled: false, intervalMs: 3_600_000 });
});

test('it turns backups on when the test asks for them', async () => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    isBackupOn: true,
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect(config.backup).toStrictEqual({ isEnabled: true, intervalMs: 3_600_000 });
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

  expect(secrets.readSetting('deployment:owner_name')).toBe('Wren Halloway');
});

test('it writes the definitions at format 2 with no task folder when no task definition is given', async () => {
  const ctx = await setupTest();

  await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', { config: [], secrets: [] });

  const manifest = await readFile(join(ctx.directory, 'definitions', 'nixie.yaml'), 'utf8');
  const entries = await readdir(join(ctx.directory, 'definitions'));

  expect([manifest, entries.toSorted()]).toStrictEqual([
    'format: 2\n',
    ['nixie.yaml', 'persona.md'],
  ]);
});

test('it writes each task definition into its folder and puts the definitions at format 4', async () => {
  const ctx = await setupTest();

  await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    hasStarterRules: true,
    taskDefinitions: [
      {
        id: 'rain-gauge',
        yaml: 'name: Check the rain gauge\nbrief: Note the total.\n',
        instructions: 'Keep the note to one line.\n',
      },
    ],
  });

  const definitionsDir = join(ctx.directory, 'definitions');

  const manifest = await readFile(join(definitionsDir, 'nixie.yaml'), 'utf8');
  const taskYaml = await readFile(join(definitionsDir, 'tasks', 'rain-gauge', 'task.yaml'), 'utf8');

  const instructions = await readFile(
    join(definitionsDir, 'tasks', 'rain-gauge', 'instructions.md'),
    'utf8',
  );

  expect([manifest, taskYaml, instructions]).toStrictEqual([
    'format: 4\n',
    'name: Check the rain gauge\nbrief: Note the total.\n',
    'Keep the note to one line.\n',
  ]);
});

test('it leaves the prices of each profile out when a gateway prices the replies', async () => {
  const ctx = await setupTest();

  await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    isGatewayPriced: true,
  });

  const text = await Bun.file(join(ctx.directory, 'config.yaml')).text();

  expect(text).not.toInclude('prices:');
});

test.each([
  {
    title: 'the computer and the code tool on',
    extras: {},
    computer: { idle_hand_back_minutes: 30, handover_expiry_minutes: 60 },
    code: {},
    google: { gmail: { poll_interval: 120_000 } },
    features: ['computer', 'code', 'devices', 'google', 'mcp'],
  },
  {
    title: 'google off',
    extras: { isGoogleOff: true },
    computer: { idle_hand_back_minutes: 30, handover_expiry_minutes: 60 },
    code: {},
    google: undefined,
    features: ['computer', 'code', 'devices', 'mcp'],
  },
  {
    title: 'the computer off',
    extras: { isComputerOff: true },
    computer: undefined,
    code: {},
    google: { gmail: { poll_interval: 120_000 } },
    features: ['code', 'devices', 'google', 'mcp'],
  },
  {
    title: 'the code tool off',
    extras: { isCodeOff: true },
    computer: { idle_hand_back_minutes: 30, handover_expiry_minutes: 60 },
    code: undefined,
    google: { gmail: { poll_interval: 120_000 } },
    features: ['computer', 'devices', 'google', 'mcp'],
  },
])('it writes a configuration with $title, and these features on: $features', async (row) => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    ...row.extras,
  });

  const config = await loadDeploymentConfig(files.configPath);

  expect({
    computer: config.computer,
    code: config.code,
    google: config.google,
    features: listFeaturesOn(config),
  }).toStrictEqual({
    computer: row.computer,
    code: row.code,
    google: row.google,
    features: row.features,
  });
});

test.each([
  {
    title: 'neither feature',
    extras: { isComputerOff: true, isCodeOff: true },
    has: { computer: false, code: false },
  },
  { title: 'the computer', extras: { isComputerOff: true }, has: { computer: false, code: true } },
  { title: 'every feature', extras: {}, has: { computer: true, code: true } },
])('it leaves out the sandbox image of a feature that is off: $title', async (row) => {
  const ctx = await setupTest();

  const files = await writeBootFiles(ctx.directory, 'http://127.0.0.1:4010', {
    config: [],
    secrets: [],
    ...row.extras,
  });

  const images = await loadSandboxManifest(files.manifestPath);

  expect({
    computer: images.computer !== undefined,
    code: images.code !== undefined,
  }).toStrictEqual(row.has);
});
