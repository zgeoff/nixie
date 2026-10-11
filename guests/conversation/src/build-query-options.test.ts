import { expect, test } from 'bun:test';
import { buildQueryOptions } from './build-query-options';

test('it reads a bearer credential placeholder from ANTHROPIC_AUTH_TOKEN', () => {
  const options = buildQueryOptions(
    {
      type: 'turn',
      profile: {
        model: 'glm-5.3',
        baseURL: 'https://gateway.example/anthropic',
        effort: 'high',
        authHeader: 'bearer',
      },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
    {
      env: { HOME: '/home/guest', ANTHROPIC_AUTH_TOKEN: 'imp-placeholder', ANTHROPIC_API_KEY: 'x' },
      toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
    },
  );

  expect(options.env).toContainEntries([
    ['ANTHROPIC_AUTH_TOKEN', 'imp-placeholder'],
    ['ANTHROPIC_BASE_URL', 'https://gateway.example/anthropic'],
    ['ANTHROPIC_MODEL', 'glm-5.3'],
    ['CLAUDE_CODE_EFFORT_LEVEL', 'high'],
  ]);
  expect(options.env).not.toContainKey('ANTHROPIC_API_KEY');
});

test('it passes the broker proxy settings on by name and nothing else from the guest env', () => {
  const options = buildQueryOptions(
    {
      type: 'turn',
      profile: {
        model: 'model-a',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
      },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
    {
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
    },
  );

  expect(options.env).toContainEntries([
    ['HTTPS_PROXY', 'http://127.0.0.1:3128'],
    ['NO_PROXY', '127.0.0.1,localhost'],
    ['SSL_CERT_FILE', '/etc/imp/ca.pem'],
    ['NODE_EXTRA_CA_CERTS', '/etc/imp/ca.pem'],
    ['NODE_USE_ENV_PROXY', '1'],
  ]);
  expect(options.env).not.toContainKey('UNRELATED');
});

test('it resumes at the boundary on a fork of the session', () => {
  const options = buildQueryOptions(
    {
      type: 'turn',
      profile: {
        model: 'model-a',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
      },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
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

test('it refuses a guest env with no placeholder for the profile auth header', () => {
  expect(() =>
    buildQueryOptions(
      {
        type: 'turn',
        profile: {
          model: 'model-a',
          baseURL: 'https://api.anthropic.com',
          effort: 'low',
          authHeader: 'x-api-key',
        },
        tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
        resume: null,
        systemPrompt: 'You are nixie.',
        input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
      },
      {
        env: { HOME: '/home/guest', ANTHROPIC_AUTH_TOKEN: 'imp-placeholder' },
        toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
      },
    ),
  ).toThrowWithMessage(Error, /no placeholder credential in ANTHROPIC_API_KEY/u);
});

test('it refuses a guest env with no HOME', () => {
  expect(() =>
    buildQueryOptions(
      {
        type: 'turn',
        profile: {
          model: 'model-a',
          baseURL: 'https://api.anthropic.com',
          effort: 'low',
          authHeader: 'x-api-key',
        },
        tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
        resume: null,
        systemPrompt: 'You are nixie.',
        input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
      },
      {
        env: { ANTHROPIC_API_KEY: 'imp-placeholder' },
        toolServer: { type: 'http', url: 'http://127.0.0.1:8901/mcp' },
      },
    ),
  ).toThrowWithMessage(Error, /needs HOME/u);
});
