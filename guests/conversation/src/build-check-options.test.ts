import { expect, test } from 'bun:test';
import { buildCheckOptions } from './build-check-options';

test('it gives a checker query no tools, no MCP server, no settings and no saved session', () => {
  const options = buildCheckOptions(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
      },
      systemPrompt: 'You check one candidate memory.',
      input: 'the input',
    },
    { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder', UNRELATED: 'kept out' },
  );

  // the next test pins the environment
  expect({ ...options, env: null }).toStrictEqual({
    tools: [],
    allowedTools: [],
    permissionMode: 'dontAsk',
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    skills: [],
    persistSession: false,
    settings: { disableBundledSkills: true, autoMemoryEnabled: false, autoDreamEnabled: false },
    systemPrompt: 'You check one candidate memory.',
    outputFormat: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          verdict: { type: 'string', enum: ['asserted', 'not_asserted', 'unsure'] },
        },
        required: ['reason', 'verdict'],
        additionalProperties: false,
      },
    },
    cwd: '/home/guest/checker',
    env: null,
  });
});

test('it gives a checker query the profile and the auth placeholder, and no other variable', () => {
  const options = buildCheckOptions(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
      },
      systemPrompt: 'You check one candidate memory.',
      input: 'the input',
    },
    { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder', UNRELATED: 'kept out' },
  );

  expect(options.env).toStrictEqual({
    HOME: '/home/guest',
    CLAUDE_CONFIG_DIR: '/home/guest/.claude',
    ANTHROPIC_API_KEY: 'imp-placeholder',
    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    ANTHROPIC_MODEL: 'claude-sonnet-5-5',
    ANTHROPIC_SMALL_FAST_MODEL: 'claude-sonnet-5-5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-5-5',
    CLAUDE_CODE_EFFORT_LEVEL: 'low',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
    DISABLE_AUTOUPDATER: '1',
  });
});

test('it asks for the reason before the verdict', () => {
  const options = buildCheckOptions(
    {
      profile: {
        model: 'claude-sonnet-5-5',
        baseURL: 'https://api.anthropic.com',
        effort: 'low',
        authHeader: 'x-api-key',
      },
      systemPrompt: 'You check one candidate memory.',
      input: 'the input',
    },
    { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' },
  );

  expect(Object.keys(options.outputFormat?.schema['properties'] ?? {})).toStrictEqual([
    'reason',
    'verdict',
  ]);
});

test('it refuses a guest with no HOME', () => {
  expect(() =>
    buildCheckOptions(
      {
        profile: {
          model: 'claude-sonnet-5-5',
          baseURL: 'https://api.anthropic.com',
          effort: 'low',
          authHeader: 'x-api-key',
        },
        systemPrompt: 'You check one candidate memory.',
        input: 'the input',
      },
      { ANTHROPIC_API_KEY: 'imp-placeholder' },
    ),
  ).toThrowWithMessage(Error, /needs HOME/u);
});

test('it refuses a guest with no placeholder for the profile auth header', () => {
  expect(() =>
    buildCheckOptions(
      {
        profile: {
          model: 'claude-sonnet-5-5',
          baseURL: 'https://api.anthropic.com',
          effort: 'low',
          authHeader: 'bearer',
        },
        systemPrompt: 'You check one candidate memory.',
        input: 'the input',
      },
      { HOME: '/home/guest', ANTHROPIC_API_KEY: 'imp-placeholder' },
    ),
  ).toThrowWithMessage(Error, /ANTHROPIC_AUTH_TOKEN/u);
});
