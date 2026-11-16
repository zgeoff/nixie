import { expect, test } from 'bun:test';
import { modelsConfigSchema } from './models-config-schema';

test('it reads a direct profile with its context tokens, cache lifetime and prices into its typed shape', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'medium',
        context_tokens: 400_000,
        cache_ttl: '1h',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.data).toStrictEqual({
    profiles: {
      'chat-direct': {
        id: 'chat-direct',
        harness: 'agent-sdk',
        baseURL: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        authHeader: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'medium',
        outsideClaude: null,
        providerPin: null,
        contextTokens: 400_000,
        cacheTTL: '1h',
        prices: { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: [],
    limits: {
      taskRun: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
      workerRun: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
      day: { dollars: 60, tokens: 80_000_000, turns: 1000, turnCap: 2000 },
      month: { dollars: 600, tokens: 600_000_000, turns: 20_000 },
    },
  });
});

test('it reads an aggregator profile with its provider pin and the role map into their typed shape', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'background-aggregator': {
        harness: 'agent-sdk',
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'glm-5.3',
        effort: 'low',
        outside_claude: true,
        provider_pin: 'z-ai',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 4 },
      },
      checker: {
        harness: 'agent-sdk',
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'claude-test-1',
        effort: 'low',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 4 },
      },
    },
    roles: {
      conversation: 'background-aggregator',
      checker: 'checker',
    },
  });

  expect(result.data).toStrictEqual({
    profiles: {
      'background-aggregator': {
        id: 'background-aggregator',
        harness: 'agent-sdk',
        baseURL: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        authHeader: 'bearer',
        model: 'glm-5.3',
        effort: 'low',
        outsideClaude: true,
        providerPin: 'z-ai',
        contextTokens: null,
        cacheTTL: '5m',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 4 },
      },
      checker: {
        id: 'checker',
        harness: 'agent-sdk',
        baseURL: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        authHeader: 'bearer',
        model: 'claude-test-1',
        effort: 'low',
        outsideClaude: null,
        providerPin: null,
        contextTokens: null,
        cacheTTL: '5m',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 4 },
      },
    },
    roles: {
      conversation: 'background-aggregator',
      checker: 'checker',
    },
    selectable: [],
    limits: {
      taskRun: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
      workerRun: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
      day: { dollars: 60, tokens: 80_000_000, turns: 1000, turnCap: 2000 },
      month: { dollars: 600, tokens: 600_000_000, turns: 20_000 },
    },
  });
});

test.each([
  ['zero', 0],
  ['a negative count', -400_000],
  ['a fraction', 400_000.5],
  ['a string', '400000'],
  ['a count below the CLI minimum', 99_999],
  ['a count above the CLI maximum', 1_000_001],
])('it refuses %s as the context tokens', (_label, contextTokens) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        context_tokens: contextTokens,
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'context_tokens'],
  });
});

test.each([
  ['claude-haiku-4-5', 200_000],
  ['claude-sonnet-5-5', 1_000_000],
  ['claude-fable-5-2', 400_000],
  ['claude-haiku-5-5[1m]', 1_000_000],
  ['anthropic/claude-sonnet-5-5', 400_000],
  ['claude-mythos-preview', 1_000_000],
])('it reads %s with a context cap of %d, within the window the CLI assumes', (model, cap) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model,
        effort: 'medium',
        context_tokens: cap,
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.data?.profiles['chat-direct']).toMatchObject({ model, contextTokens: cap });
});

test('it refuses a context cap larger than the window the CLI assumes for the model', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-haiku-4-5',
        effort: 'medium',
        context_tokens: 200_001,
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'context_tokens'],
    message:
      'the context cap of 200001 tokens is larger than the 200000-token window the Claude CLI assumes for claude-haiku-4-5',
  });
});

test('it refuses a cache lifetime the CLI does not take', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'medium',
        cache_ttl: '30m',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'cache_ttl'],
  });
});

test('it refuses a config with the conversation role unset', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { task: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'conversation'],
    message: 'the conversation role is unset, and nixie needs it to start',
  });
});

test('it refuses a role that names no profile', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct', worker: 'chat-missing' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['roles', 'worker'] });
});

test('it refuses a credential reference outside the secrets file', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'vault:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'credential'],
  });
});

test('it refuses a price table without the 1-hour cache write price', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat-direct', 'prices', 'cache_write_1h'],
  });
});

test('it reads the selectable models and the task run limits into their typed shape', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
      'router-b': {
        harness: 'agent-sdk',
        base_url: 'https://router.example/anthropic',
        credential: 'deployment:router',
        auth_header: 'bearer',
        model: 'other-family-test-3',
        outside_claude: false,
        effort: 'low',
        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 },
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: {
      'deep-think': { profile: 'chat-direct', description: 'Most capable, slow', ask: true },
      'second-look': { profile: 'router-b', description: 'Another family' },
    },
    limits: { taskRun: { default: { dollars: 1 }, max: { turns: 60 } } },
  });

  expect({ selectable: result.data?.selectable, limits: result.data?.limits }).toStrictEqual({
    selectable: [
      {
        name: 'deep-think',
        profile: 'chat-direct',
        description: 'Most capable, slow',
        isAsked: true,
      },
      { name: 'second-look', profile: 'router-b', description: 'Another family', isAsked: false },
    ],
    limits: {
      taskRun: { default: { turns: 25, dollars: 1 }, max: { turns: 60, dollars: 10 } },
      workerRun: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
      day: { dollars: 60, tokens: 80_000_000, turns: 1000, turnCap: 2000 },
      month: { dollars: 600, tokens: 600_000_000, turns: 20_000 },
    },
  });
});

test('it refuses a selectable model that names an undefined profile', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: { 'second-look': { profile: 'router-b', description: 'Another family' } },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['selectable', 'second-look', 'profile'],
    message: 'the selectable model second-look names the profile router-b, which is not defined',
  });
});

test('it refuses a selectable model whose profile sets no prices', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: { 'second-look': { profile: 'chat-direct', description: 'Another family' } },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['selectable', 'second-look', 'profile'],
    message: 'the selectable model second-look names the profile chat-direct, which sets no prices',
  });
});

test.each([
  ['turns', { default: { turns: 30 }, max: { turns: 20 } }],
  ['dollars', { default: { dollars: 12 } }],
])('it refuses a default task run limit of %s above its max', (key, taskRun) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
    limits: { taskRun },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['limits', 'taskRun', 'default', key],
  });
});

test('it defaults the turn cap of the day to twice its turns', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    limits: { day: { turns: 300 } },
  });

  expect(result.data?.limits.day).toStrictEqual({
    dollars: 60,
    tokens: 80_000_000,
    turns: 300,
    turnCap: 600,
  });
});

test('it reads the day and month limits that the config sets', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    limits: {
      day: { dollars: 10, tokens: 1000, turns: 50, turnCap: 70 },
      month: { dollars: 100, tokens: 10_000, turns: 500 },
    },
  });

  expect({ day: result.data?.limits.day, month: result.data?.limits.month }).toStrictEqual({
    day: { dollars: 10, tokens: 1000, turns: 50, turnCap: 70 },
    month: { dollars: 100, tokens: 10_000, turns: 500 },
  });
});

test('it refuses a day turn cap below the day turns', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    limits: { day: { turns: 100, turnCap: 99 } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['limits', 'day', 'turnCap'] });
});

test.each([
  ['day', 'dollars'],
  ['day', 'tokens'],
  ['day', 'turns'],
  ['month', 'dollars'],
  ['month', 'tokens'],
  ['month', 'turns'],
])('it refuses a %s limit of 0 %s', (period, measure) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    limits: { [period]: { [measure]: 0 } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['limits', period, measure] });
});

test('it refuses an unknown key, so a typo never passes as a default', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        efort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['profiles', 'chat-direct'] });
});

test('it refuses a profile that names no harness, and names the profile and the fix', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['profiles', 'chat-direct', 'harness'],
      message: 'the profile chat-direct names no harness; add harness: agent-sdk or harness: codex',
    }),
  ]);
});

test('it refuses a profile on a harness that has no record', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'gemini',
        base_url: 'https://api.gemini.example.test',
        credential: 'deployment:gemini',
        model: 'gem-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['profiles', 'chat-direct', 'harness'],
      message:
        'the profile chat-direct names the harness gemini, which nixie does not run; use harness: agent-sdk or harness: codex',
    }),
  ]);
});

test('it refuses a codex profile on the conversation role, naming each missing feature', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      'chat-codex': {
        harness: 'codex',
        base_url: 'https://api.openai.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
        effort: 'medium',
        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 1, output: 1 },
      },
    },
    roles: { conversation: 'chat-codex' },
  });

  expect(result.error?.issues).toPartiallyContain(
    expect.objectContaining({
      path: ['roles', 'conversation'],
      message:
        'the conversation role runs on the profile chat-codex, whose codex harness lacks resume, resume-at-entry, live-messages, summarize, context-window',
    }),
  );
});

test('it refuses a codex profile on the checker role', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      chat: {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
      'check-codex': {
        harness: 'codex',
        base_url: 'https://api.openai.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
        effort: 'medium',
        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 1, output: 1 },
      },
    },
    roles: { conversation: 'chat', checker: 'check-codex' },
  });

  expect(result.error?.issues).toPartiallyContain(
    expect.objectContaining({
      path: ['roles', 'checker'],
      message:
        'the checker role runs on the profile check-codex, whose codex harness lacks structured-output',
    }),
  );
});

test('it accepts a codex profile on the task and worker roles', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      chat: {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
      'work-codex': {
        harness: 'codex',
        base_url: 'https://api.openai.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
        effort: 'medium',
        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 1, output: 1 },
      },
    },
    roles: { conversation: 'chat', task: 'work-codex', worker: 'work-codex' },
  });

  expect(result.error).toBeUndefined();
});

test('it refuses a codex profile that holds auth_header', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      chat: {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
      'work-codex': {
        harness: 'codex',
        base_url: 'https://api.openai.example.test',
        credential: 'deployment:openai',
        auth_header: 'bearer',
        model: 'gpt-test-1',
        effort: 'medium',
        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 1, output: 1 },
      },
    },
    roles: { conversation: 'chat', task: 'work-codex' },
  });

  expect(result.error?.issues).toPartiallyContain(
    expect.objectContaining({ code: 'unrecognized_keys', keys: ['auth_header'] }),
  );
});

test('it refuses a profile with no outside_claude and a model ID without claude', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      router: {
        harness: 'agent-sdk',
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'glm-5.3',
        effort: 'low',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 4 },
      },
    },
    roles: { conversation: 'router' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'router', 'outside_claude'],
    message:
      'the model glm-5.3 names no Claude model, so the profile must state outside_claude: true or false',
  });
});

test.each([true, false])(
  'it loads a model ID without claude when the profile states outside_claude: %p',
  (outsideClaude) => {
    const result = modelsConfigSchema.safeParse({
      profiles: {
        router: {
          harness: 'agent-sdk',
          base_url: 'https://gateway.example/anthropic',
          credential: 'deployment:gateway',
          auth_header: 'bearer',
          model: 'glm-5.3',
          outside_claude: outsideClaude,
          effort: 'low',
          prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 4 },
        },
        checker: {
          harness: 'agent-sdk',
          base_url: 'https://api.anthropic.com',
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
          prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
        },
      },
      roles: { conversation: 'router', checker: 'checker' },
    });

    expect(result.data?.profiles['router']).toMatchObject({ outsideClaude });
  },
);

test('it loads a Claude model ID with no outside_claude and reads the mark as null', () => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      chat: {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'low',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat' },
  });

  expect(result.data?.profiles['chat']).toMatchObject({ outsideClaude: null });
});

test.each([
  ['no outside_claude', undefined],
  ['outside_claude: false', false],
])('it refuses a provider pin on a profile with %s', (_label, outsideClaude) => {
  const result = modelsConfigSchema.safeParse({
    profiles: {
      chat: {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-sonnet-5-5',
        effort: 'low',
        provider_pin: 'z-ai',
        ...(outsideClaude === undefined ? {} : { outside_claude: outsideClaude }),
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['profiles', 'chat', 'provider_pin'],
    message:
      'a provider pin changes the request body, which nixie does only for a profile outside Claude',
  });
});
