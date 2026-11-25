import { expect, test } from 'bun:test';
import { harnessCapabilities } from '@heynixie/wire';
import { agentSDKHarnessDefinition } from '../agent/agent-sdk-harness-definition';
import { codexHarnessDefinition } from '../codex/codex-harness-definition';
import { buildModelsConfigSchema } from './build-models-config-schema';

function setupTest(
  capabilities = harnessCapabilities,
  readToolCallWaitMs?: Parameters<typeof buildModelsConfigSchema>[2],
) {
  return {
    schema: buildModelsConfigSchema(
      [agentSDKHarnessDefinition, codexHarnessDefinition],
      capabilities,
      readToolCallWaitMs,
    ),
  };
}

test('it refuses the conversation role on a harness that lacks resume at an entry, naming each missing feature', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      'chat-codex': {
        harness: 'codex',
        effort: 'medium',
        base_url: 'https://models.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
      },
    },
    roles: { conversation: 'chat-codex' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'conversation'],
    message:
      'the conversation role runs on the profile chat-codex, whose codex harness lacks resume, resume-at-entry, live-messages, summarize, context-window',
  });
});

test("it refuses an unset role on the conversation's profile when that profile's harness lacks the role's needs", () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      'chat-codex': {
        harness: 'codex',
        effort: 'medium',
        base_url: 'https://models.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
      },
    },
    roles: { conversation: 'chat-codex' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'checker'],
    message:
      'the checker role runs on the profile chat-codex, whose codex harness lacks structured-output',
  });
});

test('it refuses the checker role on a profile whose harness lacks structured output', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
      'chat-codex': {
        harness: 'codex',
        effort: 'medium',
        base_url: 'https://models.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
      },
    },
    roles: { conversation: 'chat-direct', checker: 'chat-codex' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['roles', 'checker'],
      message:
        'the checker role runs on the profile chat-codex, whose codex harness lacks structured-output',
    }),
  ]);
});

test("it refuses an unset task role when the conversation's profile, which tasks then run on, sets no prices", () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['roles', 'task'],
      message:
        "the task role is unset, so tasks run on the conversation's profile chat-direct, which sets no prices",
    }),
  ]);
});

test('it refuses a task role whose profile sets no prices, though its harness fits a task', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
      'task-codex': {
        harness: 'codex',
        effort: 'medium',
        base_url: 'https://models.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
      },
    },
    roles: { conversation: 'chat-direct', task: 'task-codex' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['roles', 'task'],
      message: 'the task role names the profile task-codex, which sets no prices',
    }),
  ]);
});

test('it accepts a selectable model on a profile whose harness has everything a task needs', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
      'task-codex': {
        harness: 'codex',
        effort: 'medium',
        base_url: 'https://models.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
        prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 },
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: { 'second-look': { profile: 'task-codex', description: 'Another loop' } },
  });

  expect(result.error).toBeUndefined();
});

test.each(['conversation', 'task'] as const)(
  'it refuses the %s role on a profile whose harness lacks images',
  (role) => {
    const ctx = setupTest({
      ...harnessCapabilities,
      codex: new Set(harnessCapabilities['agent-sdk']).difference(new Set(['images'])),
    });

    const result = ctx.schema.safeParse({
      profiles: {
        'chat-codex': {
          harness: 'codex',
          effort: 'medium',
          base_url: 'https://models.example.test',
          credential: 'deployment:openai',
          model: 'gpt-test-1',
        },
      },
      roles: { conversation: 'chat-codex' },
    });

    expect(result.error?.issues).toPartiallyContain({
      path: ['roles', role],
      message: `the ${role} role runs on the profile chat-codex, whose codex harness lacks images`,
    });
  },
);

test.each([
  {
    name: 'names no harness',
    profile: {},
    message: 'the profile chat-direct names no harness; add harness: agent-sdk or harness: codex',
  },
  {
    name: 'names a harness outside the table',
    profile: { harness: 'gemini' },
    message:
      'the profile chat-direct names the harness gemini, which nixie does not run; use harness: agent-sdk or harness: codex',
  },
])('it lists every harness in the table when a profile $name', (row) => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      'chat-direct': {
        ...row.profile,
        base_url: 'https://models.example.test',
        credential: 'deployment:anthropic',
        model: 'claude-test-1',
      },
    },
    roles: { conversation: 'chat-direct' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({ path: ['profiles', 'chat-direct', 'harness'], message: row.message }),
  ]);
});

test('it refuses the checker role on a profile outside Claude', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      router: {
        harness: 'agent-sdk',
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'glm-5.3',
        outside_claude: true,
        effort: 'low',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 4 },
      },
    },
    roles: { conversation: 'router', checker: 'router' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'checker'],
    message:
      'the checker role runs on the profile router, which is outside Claude, and a check removes no CLI block',
  });
});

test("it refuses an unset checker role when the conversation's profile is outside Claude", () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      router: {
        harness: 'agent-sdk',
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'glm-5.3',
        outside_claude: true,
        effort: 'low',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 4 },
      },
    },
    roles: { conversation: 'router' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'checker'],
    message:
      'the checker role runs on the profile router, which is outside Claude, and a check removes no CLI block',
  });
});

test('it loads a profile outside Claude on the conversation role when the checker runs elsewhere', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      router: {
        harness: 'agent-sdk',
        base_url: 'https://gateway.example/anthropic',
        credential: 'deployment:gateway',
        auth_header: 'bearer',
        model: 'glm-5.3',
        outside_claude: true,
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

  expect(result.success).toBe(true);
});

test('it accepts the worker role with the default worker run limits', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
  });

  expect(result.data?.limits.workerRun).toStrictEqual({
    minutes: 10,
    turns: 25,
    tokens: 2_000_000,
    dollars: 2,
  });
});

test('it accepts a worker run limit of minutes longer than the wait when no worker role is set', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
    limits: { workerRun: { minutes: 60 } },
  });

  expect(result.error).toBeUndefined();
});

test('it refuses a worker run limit of minutes longer than the caller harness wait less 30 seconds, giving both figures', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
    limits: { workerRun: { minutes: 15 } },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['limits', 'workerRun', 'minutes'],
      message:
        'the worker run limit of 15 minutes is longer than the 14.5 minutes that the agent-sdk harness of the profile chat-direct gives a tool call (its wait of 15 minutes less 30 seconds)',
    }),
  ]);
});

test('it accepts a worker run limit of minutes equal to the caller harness wait less 30 seconds', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
    limits: { workerRun: { minutes: 14.5 } },
  });

  expect(result.error).toBeUndefined();
});

test('it reads the wait from the loaded harness, so a shorter wait refuses a shorter limit', () => {
  const ctx = setupTest(harnessCapabilities, () => 300_000);

  const result = ctx.schema.safeParse({
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
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['limits', 'workerRun', 'minutes'],
      message:
        'the worker run limit of 10 minutes is longer than the 4.5 minutes that the agent-sdk harness of the profile chat-direct gives a tool call (its wait of 5 minutes less 30 seconds)',
    }),
  ]);
});

test('it refuses the worker role when a caller harness has a null tool call wait, naming the harness', () => {
  const ctx = setupTest(harnessCapabilities, () => null);

  const result = ctx.schema.safeParse({
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
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['roles', 'worker'],
      message:
        "the worker role is set, and the agent-sdk harness of the profile chat-direct has no tool call wait, so a worker's limit error could miss its caller",
    }),
  ]);
});

test('it accepts a null tool call wait when no worker role is set', () => {
  const ctx = setupTest(harnessCapabilities, () => null);

  const result = ctx.schema.safeParse({
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
  });

  expect(result.error).toBeUndefined();
});

test('it refuses the worker role on a profile with no price table', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
      'worker-bare': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'medium',
      },
    },
    roles: { conversation: 'chat-direct', worker: 'worker-bare' },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['roles', 'worker'],
      message:
        'the worker role names the profile worker-bare, which sets no prices, and a worker run counts its cost against its dollar limit',
    }),
  ]);
});

test('it refuses a selectable model whose harness has no tool call wait while the worker role is set', () => {
  const ctx = setupTest(harnessCapabilities, (profile) =>
    profile.id === 'big-direct' ? null : 900_000,
  );

  const result = ctx.schema.safeParse({
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
      'big-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-big',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
    selectable: { big: { profile: 'big-direct', description: 'Slower and stronger.' } },
  });

  expect(result.error?.issues).toStrictEqual([
    expect.objectContaining({
      path: ['selectable', 'big', 'profile'],
      message:
        "the worker role is set, and the agent-sdk harness of the profile big-direct of the selectable model big has no tool call wait, so a worker's limit error could miss its caller",
    }),
  ]);
});

test('it accepts a selectable model whose harness has no tool call wait when no worker role is set', () => {
  const ctx = setupTest(harnessCapabilities, (profile) =>
    profile.id === 'big-direct' ? null : 900_000,
  );

  const result = ctx.schema.safeParse({
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
      'big-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-big',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct' },
    selectable: { big: { profile: 'big-direct', description: 'Slower and stronger.' } },
  });

  expect(result.error).toBeUndefined();
});

test('it does not check the tool call wait of a selectable model that asks', () => {
  const ctx = setupTest(harnessCapabilities, (profile) =>
    profile.id === 'big-direct' ? null : 900_000,
  );

  const result = ctx.schema.safeParse({
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
      'big-direct': {
        harness: 'agent-sdk',
        base_url: 'https://api.anthropic.com',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-big',
        effort: 'medium',
        prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct', worker: 'chat-direct' },
    selectable: { big: { profile: 'big-direct', description: 'Asks first.', ask: true } },
  });

  expect(result.error).toBeUndefined();
});

test('it accepts a call role that names a profile of a harness that fits a call', () => {
  const ctx = setupTest();

  const profile = {
    harness: 'agent-sdk',
    base_url: 'https://api.anthropic.com',
    credential: 'deployment:anthropic',
    auth_header: 'x-api-key',
    model: 'claude-test-1',
    effort: 'medium',
    prices: { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 },
  };

  const result = ctx.schema.safeParse({
    profiles: { 'chat-direct': profile, 'call-fast': { ...profile, model: 'claude-test-2' } },
    roles: { conversation: 'chat-direct', call: 'call-fast' },
  });

  expect(result.data?.roles).toStrictEqual({ conversation: 'chat-direct', call: 'call-fast' });
});

test('it refuses the call role on a profile whose harness lacks resume at an entry', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
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
      'chat-codex': {
        harness: 'codex',
        effort: 'medium',
        base_url: 'https://models.example.test',
        credential: 'deployment:openai',
        model: 'gpt-test-1',
      },
    },
    roles: { conversation: 'chat-direct', call: 'chat-codex' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['roles', 'call'],
    message:
      'the call role runs on the profile chat-codex, whose codex harness lacks resume, resume-at-entry, live-messages',
  });
});
