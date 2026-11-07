import { expect, test } from 'bun:test';
import { agentSDKProfileSchema } from './agent-sdk-profile-schema';
import { buildModelsConfigSchema } from './build-models-config-schema';
import { buildStubCodexProfileSchema } from './test-utils/build-stub-codex-profile-schema';

function setupTest() {
  return {
    schema: buildModelsConfigSchema([agentSDKProfileSchema, buildStubCodexProfileSchema()]),
  };
}

test('it refuses the conversation role on a harness that lacks resume at an entry, naming each missing feature', () => {
  const ctx = setupTest();

  const result = ctx.schema.safeParse({
    profiles: {
      'chat-codex': {
        harness: 'codex',
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
