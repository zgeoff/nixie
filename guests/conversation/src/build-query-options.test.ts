import { expect, test } from 'bun:test';
import { buildMockSummarizeFrame, buildMockTurnFrame } from '@heynixie/wire/test-utils';
import invariant from 'tiny-invariant';
import { buildQueryOptions } from './build-query-options';

test('it reads a bearer credential placeholder from ANTHROPIC_AUTH_TOKEN', () => {
  const options = buildQueryOptions(
    buildMockTurnFrame({
      profile: {
        model: 'glm-5.3',
        baseURL: 'https://gateway.example/anthropic',
        effort: 'high',
        authHeader: 'bearer',
      },
    }),
    {
      env: { HOME: '/home/guest', ANTHROPIC_AUTH_TOKEN: 'imp-placeholder', ANTHROPIC_API_KEY: 'x' },
      toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
    },
  );

  invariant(options.env);

  expect(options.env).toContainEntries([
    ['ANTHROPIC_AUTH_TOKEN', 'imp-placeholder'],
    ['ANTHROPIC_BASE_URL', 'https://gateway.example/anthropic'],
    ['ANTHROPIC_MODEL', 'glm-5.3'],
    ['CLAUDE_CODE_EFFORT_LEVEL', 'high'],
  ]);

  expect(options.env).not.toContainKey('ANTHROPIC_API_KEY');
});

test('it asks the model for the summarized thinking display', () => {
  const options = buildQueryOptions(buildMockTurnFrame({ profile: { authHeader: 'x-api-key' } }), {
    env: { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' },
    toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
  });

  expect(options.thinking).toStrictEqual({ type: 'adaptive', display: 'summarized' });
});

test('it passes the broker proxy settings on by name and nothing else from the guest env', () => {
  const options = buildQueryOptions(buildMockTurnFrame({ profile: { authHeader: 'x-api-key' } }), {
    env: {
      HOME: '/home/guest',
      ANTHROPIC_API_KEY: 'imp-placeholder',
      HTTPS_PROXY: 'http://127.0.0.1:3128',
      NO_PROXY: '127.0.0.1,localhost',
      SSL_CERT_FILE: '/etc/imp/ca.pem',
      NODE_EXTRA_CA_CERTS: '/etc/imp/ca.pem',
      NODE_USE_ENV_PROXY: '1',
      UNRELATED: 'kept out',
    },
    toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
  });

  invariant(options.env);

  expect(options.env).toContainEntries([
    ['HTTPS_PROXY', 'http://127.0.0.1:3128'],
    ['NO_PROXY', '127.0.0.1,localhost'],
    ['SSL_CERT_FILE', '/etc/imp/ca.pem'],
    ['NODE_EXTRA_CA_CERTS', '/etc/imp/ca.pem'],
    ['NODE_USE_ENV_PROXY', '1'],
  ]);

  expect(options.env).not.toContainKey('UNRELATED');
});

test('it turns off every CLI compaction, the automatic one and the manual one', () => {
  const options = buildQueryOptions(buildMockTurnFrame({ profile: { authHeader: 'x-api-key' } }), {
    env: { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' },
    toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
  });

  expect(options.settings).toMatchObject({
    autoCompactEnabled: false,
    precomputeCompactionEnabled: false,
    idleCompaction: false,
  });

  expect(options.env).toContainEntry(['DISABLE_COMPACT', '1']);
});

test('it sets the CLI tool-output limit to 12,000 tokens and turns its large output files off', () => {
  const options = buildQueryOptions(buildMockTurnFrame({ profile: { authHeader: 'x-api-key' } }), {
    env: {
      HOME: '/home/guest',
      ANTHROPIC_API_KEY: 'imp-placeholder',
      MAX_MCP_OUTPUT_TOKENS: '90000',
      ENABLE_MCP_LARGE_OUTPUT_FILES: '1',
    },
    toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
  });

  expect(options.env).toContainEntries([
    ['MAX_MCP_OUTPUT_TOKENS', '12000'],
    ['ENABLE_MCP_LARGE_OUTPUT_FILES', '0'],
  ]);
});

test.each([['5m'], ['1h']] as const)(
  'it passes a %s profile cache lifetime as the CLI promptCacheTtl setting',
  (cacheTTL) => {
    const options = buildQueryOptions(buildMockTurnFrame({ profile: { cacheTTL } }), {
      env: { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' },
      toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
    });

    expect(options.settings).toContainEntry(['promptCacheTtl', cacheTTL]);
  },
);

test('it resumes at the boundary on a fork of the session', () => {
  const options = buildQueryOptions(
    buildMockTurnFrame({
      profile: { authHeader: 'x-api-key' },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
    {
      env: { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' },
      toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
    },
  );

  expect(options).toMatchObject({
    resume: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    resumeSessionAt: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    forkSession: true,
  });
});

test('it gives a summary no tools and one model call, on a fork of the session at its point', () => {
  const options = buildQueryOptions(
    buildMockSummarizeFrame({
      profile: { authHeader: 'x-api-key' },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
    { env: { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' }, toolServer: null },
  );

  expect(options).toMatchObject({
    tools: [],
    allowedTools: [],
    maxTurns: 1,
    mcpServers: {},
    resume: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    resumeSessionAt: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    forkSession: true,
    settings: { autoCompactEnabled: false },
  });
});

test('it gives a summary no prompt dispatch, no SDK skills and no bundled skills', () => {
  const options = buildQueryOptions(
    buildMockSummarizeFrame({
      profile: { authHeader: 'x-api-key' },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
    { env: { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' }, toolServer: null },
  );

  expect(options).toMatchObject({
    skills: [],
    verbatimPrompts: true,
    settingSources: [],
    settings: { disableBundledSkills: true },
  });
});

test('it refuses a guest env with no placeholder for the profile auth header', () => {
  expect(() =>
    buildQueryOptions(buildMockTurnFrame({ profile: { authHeader: 'x-api-key' } }), {
      env: { HOME: '/home/guest', ANTHROPIC_AUTH_TOKEN: 'imp-placeholder' },
      toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
    }),
  ).toThrowWithMessage(Error, /no placeholder credential in ANTHROPIC_API_KEY/u);
});

test('it refuses a guest env with no HOME', () => {
  expect(() =>
    buildQueryOptions(buildMockTurnFrame({ profile: { authHeader: 'x-api-key' } }), {
      env: { ANTHROPIC_API_KEY: 'imp-placeholder' },
      toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
    }),
  ).toThrowWithMessage(Error, /needs HOME/u);
});
