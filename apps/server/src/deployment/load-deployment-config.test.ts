import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
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
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  const { models, ...sections } = config;
  const { memory, ...rest } = sections;

  expect(models.roles).toStrictEqual({ conversation: 'chat-direct' });
  expect(memory.pinnedCoreTokens).toBe(2000);

  expect(rest).toStrictEqual({
    server: {
      dataDir: '/data',
      hostname: '0.0.0.0',
      port: 8080,
      secretsFile: '/etc/nixie/secrets.yaml',
      logLevel: 'info',
      outageNoticeMinutes: 10,
    },
    owner: { name: null, pronouns: { they: 'they', their: 'their' } },
    api: { readOnlyTokenHashes: [] },
    agent: { names: [] },
    compaction: { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 },
    sandbox: { adapter: 'imp' },
    imp: {
      url: 'http://127.0.0.1:7070',
      publicEgress: { hostAddresses: ['192.0.2.10/32'], egressDeny: [] },
    },
    tools: { retry: { maxAttempts: 3, budgetMs: 15_000, detailChars: 1000 } },
    wake_rules: { window: 900_000, reply_expiry: 604_800_000 },
    definitions: {
      source: { kind: 'path', path: '/etc/nixie/definitions' },
      probeIntervalMs: 300_000,
    },
    web_fetch: {
      limits: {
        bodyBytes: 2_097_152,
        timeoutMs: 15_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 5_242_880,
      },
      sandboxLimits: { vcpus: 1, memoryMiB: 192, diskMiB: 4096 },
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
      cacheMs: 300_000,
      backoff: { backoffMs: 30_000, backoffCapMs: 300_000, backoffWaitMs: 5000 },
      secretTypedURLCovers: 'redirects',
      packageRegistry: 'https://registry.npmjs.org',
      secretOwnValues: [
        'deployment_key',
        'impd_token',
        'definitions_export_token',
        'definitions_export_app_key',
        'atc_token',
        'model_credentials',
        'connector_credentials',
      ],
      secretOwnValueMinChars: 8,
    },
    images: null,
    time: { default_zone: 'Australia/Sydney' },
    tasks: { runners: 3, startedClaimLoops: 2, callClaimLoops: 1, messaging: { hopLimit: 20 } },
    reminders: { min_gap_minutes: 15 },
    actions: { runners: 4 },
    notebook: { noteChars: 50_000, maxNotes: 250, checkReasonRepeats: 3 },
    forget_notices: { note: true },
    erasure: { stuckAfterMs: 300_000 },
    mcp: { listingTimeoutSeconds: 10, servers: {} },
    policy: {
      consent: { linkMaxAgeMs: 86_400_000 },
      proposedRules: { approvals: 3, windowDays: 30, quietDays: 30 },
      mandates: { maxHours: 24 },
    },
    approvals: {
      defer: { default_minutes: 60, evening_at: '18:00', morning_at: '08:00' },
      lapse_days: { action: 3, memory: 14, skill: 14, rule_change: 14, prompt: 14, mcp: 14 },
      passkey_window_minutes: 10,
    },
    skills: { catalogShare: 0.02 },
    backup: { isEnabled: true, intervalMs: 3_600_000 },
  });
});

test('it reads the retry settings of the tools section as the config sets them', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      'tools: { retry_attempts: 2, retry_budget_ms: 4500, error_detail_chars: 40 }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.tools).toStrictEqual({
    retry: { maxAttempts: 2, budgetMs: 4500, detailChars: 40 },
  });
});

test('it reads a model profile, with the default of each setting it leaves out', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
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
      harness: 'agent-sdk',
      baseURL: 'https://api.anthropic.com',
      credential: 'deployment:anthropic',
      authHeader: 'x-api-key',
      model: 'claude-test-1',
      effort: 'medium',
      outsideClaude: null,
      providerPin: null,
      contextTokens: null,
      cacheTTL: '5m',
      prices: { input: 1, cacheWrite: 1, cacheWrite1h: 1, cachedInput: 0.1, output: 4 },
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
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
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
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
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
  const config = await loadDeploymentConfig(
    join(import.meta.dir, '../../../../preview/config.yaml'),
  );

  expect(config.sandbox).toStrictEqual({ adapter: 'test' });
  expect(config.owner.name).toBe('Juniper Vale');
  expect(config.models.roles).toStrictEqual({ conversation: 'preview', worker: 'preview' });

  expect(config.models.limits.workerRun).toStrictEqual({
    minutes: 5,
    turns: 10,
    tokens: 500_000,
    dollars: 0.5,
  });

  // the host's credential broker replaces only the authorization header
  expect(config.models.profiles['preview']).toStrictEqual(
    expect.objectContaining({ authHeader: 'bearer' }),
  );
});

test("it reads the list prices of the preview's model, with the long-prompt set above 100,000 tokens", async () => {
  const config = await loadDeploymentConfig(
    join(import.meta.dir, '../../../../preview/config.yaml'),
  );

  expect(config.models.profiles['preview']?.model).toBe('claude-haiku-5-5');

  expect(config.models.profiles['preview']?.prices).toStrictEqual({
    input: 0.1,
    cacheWrite: 0.125,
    cacheWrite1h: 0.2,
    cachedInput: 0.01,
    output: 0.5,
    longPrompt: {
      overTokens: 100_000,
      input: 0.5,
      cacheWrite: 0.625,
      cacheWrite1h: 1,
      cachedInput: 0.05,
      output: 2.5,
    },
  });
});

test('it refuses to start the imp adapter with the imp section unset', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
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
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
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

test('it reads the quiet hours and the defer settings the file sets', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'quiet_hours: { start: "22:00", end: "07:00" }',
      'approvals:',
      '  defer: { default_minutes: 30, evening_at: "19:00" }',
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect({ quiet: config.quiet_hours, defer: config.approvals.defer }).toStrictEqual({
    quiet: { start: '22:00', end: '07:00' },
    defer: { default_minutes: 30, evening_at: '19:00', morning_at: '08:00' },
  });
});

test('it reads the passkey window the file sets, in minutes', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'approvals:',
      '  passkey_window_minutes: 3',
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.approvals.passkey_window_minutes).toBe(3);
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
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
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

test('it refuses a file that holds an unknown key and a bad value, and names only the bad value', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'server:',
      '  log_level: verbose',
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      'modles: {}',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\nserver.log_level: Invalid option`,
  );
});

test('it refuses an export title template that holds an unknown placeholder, and names it', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct:',
      '      harness: agent-sdk',
      '      base_url: https://api.anthropic.com',
      '      credential: deployment:anthropic',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: medium',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: chat-direct',
      'imp:',
      '  url: http://127.0.0.1:7070',
      'definitions:',
      '  source: { kind: path, path: /etc/nixie/definitions }',
      '  export:',
      '    repository: harbour/definitions',
      "    title: 'skills: {verb} {skill}'",
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}:\ndefinitions.export.title: unknown placeholder {verb}; use {skill}, {operation}, {agent}, {owner}, {approval}, {proposal}`,
  );
});

test('it refuses a file that is not YAML', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, 'models: [unclosed');

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    `nixie refuses the deployment configuration in ${ctx.path}: it is not YAML`,
  );
});

test.each([
  ['the compose recipe', '../../../../deploy/compose/config.yaml'],
  ['the compose recipe on the test sandbox', '../../../../deploy/compose/ci/config.yaml'],
  ['the preview', '../../../../preview/config.yaml'],
])('it draws on an OpenAI profile by default in the config of %s', async (_name, path) => {
  const config = await loadDeploymentConfig(join(import.meta.dir, path));

  expect(config.images?.profiles[config.images.default]?.provider).toBe('openai');
});

test('it keeps a Google profile beside the default in the compose recipe', async () => {
  const config = await loadDeploymentConfig(
    join(import.meta.dir, '../../../../deploy/compose/config.yaml'),
  );

  expect(Object.values(config.images?.profiles ?? {}).map((profile) => profile.provider)).toContain(
    'gemini',
  );
});

test("it draws on an OpenAI profile by default in the Kubernetes manifest's config", async () => {
  const ctx = await setupTest();

  const manifest = await Bun.file(
    join(import.meta.dir, '../../../../deploy/kubernetes/config.yaml'),
  ).text();

  const configMapSchema = z.looseObject({
    metadata: z.looseObject({ name: z.string() }),
    data: z.record(z.string(), z.string()).optional(),
  });

  const parsedManifest: unknown = Bun.YAML.parse(manifest);
  const documents = z.array(configMapSchema).parse(parsedManifest);
  const configMap = documents.find((document) => document.metadata.name === 'nixie-config');

  await writeFile(ctx.path, configMap?.data?.['config.yaml'] ?? '');

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.images?.profiles[config.images.default]?.provider).toBe('openai');
});

test.each([
  {
    title: 'leaves the computer and the code tool off when their sections are absent',
    sections: [],
    computer: undefined,
    code: undefined,
  },
  {
    title: 'turns them on, with the computer defaults, when each section is empty',
    sections: ['computer: {}', 'code: {}'],
    computer: { idle_hand_back_minutes: 30, handover_expiry_minutes: 60 },
    code: {},
  },
])('it $title', async (row) => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      ...row.sections,
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect({ computer: config.computer, code: config.code }).toStrictEqual({
    computer: row.computer,
    code: row.code,
  });
});

test.each([
  {
    title: 'leaves google off when the file has no google section',
    sections: [],
    google: undefined,
  },
  {
    title: 'turns google on with the default gmail poll when its section is empty',
    sections: ['google: {}'],
    google: { gmail: { poll_interval: 120_000 }, break_notice: 172_800_000 },
  },
  {
    title: 'reads the gmail poll interval from under the google section',
    sections: ['google: { gmail: { poll_interval: 30s } }'],
    google: { gmail: { poll_interval: 30_000 }, break_notice: 172_800_000 },
  },
  {
    title: 'reads the time a broken connection waits before the model hears of it again',
    sections: ['google: { break_notice: 3d }'],
    google: { gmail: { poll_interval: 120_000 }, break_notice: 259_200_000 },
  },
])('it $title', async (row) => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      ...row.sections,
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect({ google: config.google, gmail: config.gmail }).toStrictEqual({
    google: row.google,
    gmail: undefined,
  });
});

test('it refuses a gmail section outside the google section, and says where it moved', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      'gmail: { poll_interval: 30s }',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(/under google/u);
});

test('it refuses a search section with no credential', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      'search: { daily_call_cap: 50 }',
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(/search\.credential/u);
});

test('it reads a search section with its credential, and fills no URL or price the file leaves out', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      'search: { credential: "deployment:finder" }',
    ].join('\n'),
  );

  const config = await loadDeploymentConfig(ctx.path);

  expect(config.search).toStrictEqual({ daily_call_cap: 200, credential: 'deployment:finder' });
});

test('it refuses an image profile whose provider no image adapter has, and names the ones it has', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    [
      'models:',
      '  profiles:',
      '    chat-direct: { harness: agent-sdk, base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium,',
      '        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 } }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
      'images:',
      '  default: easel',
      '  profiles:',
      '    easel: { provider: brushwork, model: easel-1, credential: "deployment:easel",',
      "      prices: { '1024x1024': 1, '1536x1024': 1, '1024x1536': 1 } }",
    ].join('\n'),
  );

  expect(loadDeploymentConfig(ctx.path)).rejects.toThrow(
    'images.profiles.easel.provider: the provider brushwork is no image provider of this nixie; use one of openai, gemini',
  );
});
