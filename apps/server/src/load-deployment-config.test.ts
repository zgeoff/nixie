import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDeploymentConfig } from './load-deployment-config';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-config-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'config.yaml') };
}

test('it reads every section, with the default of each setting the file leaves out', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const { models, ...sections } = await loadDeploymentConfig(ctx.path);

  const { memory_writer: memoryWriter, memory, memory_consolidation: _, ...rest } = sections;

  expect(models.roles).toStrictEqual({ conversation: 'chat-direct' });
  expect(memoryWriter.batchMessages).toBe(4);
  expect(memory.pinnedCoreTokens).toBe(2000);

  expect(rest).toStrictEqual({
    server: {
      dataDir: '/data',
      hostname: '0.0.0.0',
      port: 8080,
      secretsFile: '/etc/nixie/secrets.yaml',
      logLevel: 'info',
    },
    owner: { name: null, pronouns: { they: 'they', their: 'their' } },
    agent: { names: [] },
    compaction: { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 },
    sandbox: { adapter: 'imp' },
    imp: {
      url: 'http://127.0.0.1:7070',
      publicEgress: { hostAddresses: ['192.0.2.10/32'], egressDeny: [] },
    },
    definitions: {
      source: { kind: 'path', path: '/etc/nixie/definitions' },
      probeIntervalMs: 300_000,
    },
    web_fetch: {
      limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 20_000 },
      fetchesPerSandbox: 50,
      sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
    },
    time: { default_zone: 'Australia/Sydney' },
    tasks: { runners: 3 },
    actions: { runners: 4 },
    skills: { catalogShare: 0.02 },
  });
});

test("it reads the memory writer's defaults when the file leaves its section out", async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.memory_writer).toStrictEqual({
    batchMessages: 4,
    batchTokens: 12_000,
    idleMs: 300_000,
    maxAgeMs: 1_200_000,
    paceMs: 12_000,
    itemListTokens: 8000,
    topItems: 20,
    proposalCap: 10,
    firstBackoffMs: 30_000,
    maxBackoffMs: 3_600_000,
  });
});

test("it reads memory consolidation's weekly defaults when the file leaves its section out", async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.memory_consolidation).toStrictEqual({
    periodMs: 604_800_000,
    maxChanges: 30,
    itemListTokens: 24_000,
    topItems: 20,
    lapseMs: 604_800_000,
    retryMs: 3_600_000,
  });
});

test("it reads the memory writer's hourly batch limit as the wait between batches", async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      'memory_writer: { batches_per_hour: 60 }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.memory_writer.paceMs).toBe(60_000);
});

test('it reads a model profile, with the default of each setting it leaves out', async () => {
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
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.models.profiles).toStrictEqual({
    'chat-direct': {
      id: 'chat-direct',
      baseURL: 'https://api.anthropic.com',
      credential: 'deployment:anthropic',
      authHeader: 'x-api-key',
      model: 'claude-test-1',
      effort: 'medium',
      providerPin: null,
      contextTokens: null,
      cacheTTL: '5m',
      prices: null,
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
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\nmodels.roles.conversation: the conversation role is unset, and nixie needs it to start`,
  );
});

test('it reads the test sandbox with no imp section', async () => {
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
      'sandbox:',
      '  adapter: test',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.sandbox).toStrictEqual({ adapter: 'test' });
  expect(config.imp).toBeUndefined();
});

test("it loads the preview's configuration on the test sandbox, with its invented owner and a bearer credential", async () => {
  const config = await loadDeploymentConfig(join(import.meta.dir, '../../../preview/config.yaml'));

  expect(config.sandbox).toStrictEqual({ adapter: 'test' });
  expect(config.owner.name).toBe('Juniper Vale');
  expect(config.models.roles).toStrictEqual({ conversation: 'preview' });

  // the host's credential broker replaces only the authorization header
  expect(config.models.profiles['preview']?.authHeader).toBe('bearer');
});

test('it refuses to start the imp adapter with the imp section unset', async () => {
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
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\nimp: the imp section is unset, and the imp sandbox adapter needs it`,
  );
});

test('it reads the log level the server section sets', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'server:',
      '  log_level: warn',
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
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.server.logLevel).toBe('warn');
});

test('it refuses a log level nixie has no name for', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'server:',
      '  log_level: verbose',
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
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\nserver.log_level: Invalid option`,
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
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      'modles: {}',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow('Unrecognized key: "modles"');
});

test('it refuses an unknown key inside a module’s section', async () => {
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
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      'tasks:',
      '  runner: 5',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\ntasks: Unrecognized key: "runner"`,
  );
});

test('it refuses a file that is not YAML', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, 'models: [unclosed');

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}: it is not YAML`,
  );
});
