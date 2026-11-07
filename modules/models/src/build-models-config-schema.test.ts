import { expect, test } from 'bun:test';
import { z } from 'zod';
import { agentSDKProfileSchema } from './agent-sdk-profile-schema';
import { buildModelsConfigSchema } from './build-models-config-schema';

function setupTest() {
  // A stand-in for a second harness's profile schema, whose profiles parse with no fields of their
  // own.
  const codexProfileSchema = z
    .strictObject({
      harness: z.literal('codex'),
      base_url: z.url(),
      credential: z.string(),
      model: z.string(),
    })
    .transform((input) => ({
      harness: input.harness,
      baseURL: input.base_url,
      credential: input.credential,
      authHeader: 'bearer' as const,
      model: input.model,
      effort: 'medium' as const,
      providerPin: null,
      contextTokens: null,
      cacheTTL: '5m' as const,
      prices: null,
    }));

  return { schema: buildModelsConfigSchema([agentSDKProfileSchema, codexProfileSchema]) };
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
