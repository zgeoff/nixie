import { expect, test } from 'bun:test';
import { resolveRoleProfile } from '@heynixie/models';
import { buildMockModelsConfig } from '@heynixie/models/test-utils';
import { buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { startSessionRunner } from './start-session-runner';
import { buildStubToolEndpoint } from './test-utils/build-stub-tool-endpoint';
import { startTestTasks } from './test-utils/start-test-tasks';

interface RunnerConfig {
  readonly models: ReturnType<typeof buildMockModelsConfig>;
  readonly credential: string;
}

// the stub sandboxes and tool endpoint, and a runner for the memory writer's system task
async function setupTest() {
  const tasks = await startTestTasks();

  const sandboxes = buildStubSandboxes();
  const tools = buildStubToolEndpoint();

  return {
    sandboxes,
    runs: tools.runs,
    startRunner: (config: RunnerConfig) =>
      startSessionRunner({
        context: tasks.context,
        profile: {
          profile: resolveRoleProfile(config.models, 'conversation'),
          credential: config.credential,
        },
        sandboxes: sandboxes.adapter,
        tools: tools.endpoint,
        toolNames: ['memory_write'],
        taskID: 'memory-writer',
        image: 'conversation',
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
        command: { argv: ['bun', '/opt/nixie/conversation/src/main.ts'], env: {} },
      }),
  };
}

test('it sums the token counts over every model turn the session ended', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'tool_use',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 1, cacheWriteTokens: 2 },
    },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      isError: false,
      turns: 1,
      usage: { inputTokens: 20, outputTokens: 7, cacheReadTokens: 3, cacheWriteTokens: 4 },
    },
  ]);

  const usage = await runner.runSession({
    systemPrompt: 'You write memory.',
    prompt: 'Read the batch.',
    signal: new AbortController().signal,
  });

  expect(usage).toStrictEqual({
    inputTokens: 30,
    outputTokens: 12,
    cacheReadTokens: 4,
    cacheWriteTokens: 6,
  });
});

test('it starts each session fresh with the prompt as its one message', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
  });

  await runner.runSession({
    systemPrompt: 'You write memory.',
    prompt: 'Read the batch.',
    signal: new AbortController().signal,
  });

  expect(ctx.sandboxes.turns).toMatchObject([
    {
      resume: null,
      systemPrompt: 'You write memory.',
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      input: [{ uuid: expect.toBeString(), text: 'Read the batch.' }],
    },
  ]);
});

test('it keeps 5-minute cache entries on a profile that sets a 1-hour lifetime', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { cacheTTL: '1h' } } }),
    credential: 'not-a-real-key',
  });

  await runner.runSession({
    systemPrompt: 'You write memory.',
    prompt: 'Read the batch.',
    signal: new AbortController().signal,
  });

  expect(ctx.sandboxes.turns.map((turn) => turn.profile.cacheTTL)).toStrictEqual(['5m']);
});

test('it throws when the guest fails the session', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
  });

  ctx.sandboxes.setGuestScript(() => [
    { type: 'failed', reason: 'tools_not_connected', detail: "nixie's tool server is failed" },
  ]);

  expect(
    runner.runSession({
      systemPrompt: 'You write memory.',
      prompt: 'Read the batch.',
      signal: new AbortController().signal,
    }),
  ).rejects.toThrowWithMessage(
    Error,
    "the memory-writer session failed: tools_not_connected: nixie's tool server is failed",
  );
});

test('it throws when a model turn of the session ended at a model API error', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'stop_sequence',
      isError: true,
      terminalReason: 'api_error',
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  expect(
    runner.runSession({
      systemPrompt: 'You write memory.',
      prompt: 'Read the batch.',
      signal: new AbortController().signal,
    }),
  ).rejects.toThrowWithMessage(Error, 'the memory-writer session ended at a model API error');
});

test('it throws an overflow apart from an API error when the session ends at prompt_too_long', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'stop_sequence',
      isError: true,
      terminalReason: 'prompt_too_long',
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  expect(
    runner.runSession({
      systemPrompt: 'You write memory.',
      prompt: 'Read the batch.',
      signal: new AbortController().signal,
    }),
  ).rejects.toThrowWithMessage(Error, "the memory-writer session's context passed its window");
});

test('it throws an overflow apart from an API error when the session ends at blocking_limit', async () => {
  const ctx = await setupTest();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'stop_sequence',
      isError: true,
      terminalReason: 'blocking_limit',
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  expect(
    runner.runSession({
      systemPrompt: 'You write memory.',
      prompt: 'Read the batch.',
      signal: new AbortController().signal,
    }),
  ).rejects.toThrowWithMessage(Error, "the memory-writer session's context passed its window");
});

test('it opens the tool run for the system task on the profile model', async () => {
  const ctx = await setupTest();

  await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { model: 'claude-test-1' } } }),
    credential: 'not-a-real-key',
  });

  expect(ctx.runs).toStrictEqual([
    {
      runID: 'memory-writer',
      thread: 'memory-writer',
      tools: ['memory_write'],
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
  ]);
});

test('it keeps the worker sandbox across restarts while its spec matches', async () => {
  const ctx = await setupTest();

  const models = buildMockModelsConfig();

  await ctx.startRunner({ models, credential: 'not-a-real-key' });
  await ctx.startRunner({ models, credential: 'not-a-real-key' });

  expect(ctx.sandboxes.created).toMatchObject([{ kind: 'worker', owner: 'memory-writer' }]);
  expect(ctx.sandboxes.destroyed).toStrictEqual([]);
});

test('it replaces the worker sandbox when its spec no longer matches', async () => {
  const ctx = await setupTest();

  const profiles = {
    'chat-direct': { baseURL: 'https://api.anthropic.com' },
    'chat-aggregator': { baseURL: 'https://gateway.example/anthropic' },
  };

  await ctx.startRunner({
    models: buildMockModelsConfig({ profiles }),
    credential: 'not-a-real-key',
  });

  await ctx.startRunner({
    models: buildMockModelsConfig({ profiles, roles: { conversation: 'chat-aggregator' } }),
    credential: 'not-a-real-key',
  });

  expect(ctx.sandboxes.created.map((spec) => spec.grants[0]?.host)).toStrictEqual([
    'api.anthropic.com',
    'gateway.example',
  ]);

  expect(ctx.sandboxes.destroyed).toHaveLength(1);
});
