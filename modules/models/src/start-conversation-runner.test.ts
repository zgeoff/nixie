import { expect, test } from 'bun:test';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { resolveRoleProfile } from './resolve-role-profile';
import { startConversationRunner } from './start-conversation-runner';
import { buildMockModelsConfig } from './test-utils/build-mock-models-config';
import { buildStubSandboxes } from './test-utils/build-stub-sandboxes';
import { buildStubToolEndpoint } from './test-utils/build-stub-tool-endpoint';
import { readRecordsByKind } from './test-utils/read-records-by-kind';
import { runNextStep } from './test-utils/run-next-step';
import { startTestTasks } from './test-utils/start-test-tasks';

interface RunnerConfig {
  readonly models: ReturnType<typeof buildMockModelsConfig>;
  readonly credential: string;
  readonly toolNames: readonly string[];
}

// the conversation task, and the stub sandboxes and tool endpoint
async function setupTest() {
  const tasks = await startTestTasks();
  const sandboxes = buildStubSandboxes();
  const tools = buildStubToolEndpoint();

  await createConversationTask(tasks.context);

  return {
    ...tasks,
    sandboxes,
    runs: tools.runs,
    startRunner: (config: RunnerConfig) =>
      startConversationRunner({
        context: tasks.context,
        profile: {
          profile: resolveRoleProfile(config.models, 'conversation'),
          credential: config.credential,
        },
        sandboxes: sandboxes.adapter,
        tools: tools.endpoint,
        toolNames: config.toolNames,
        image: 'conversation',
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
        command: { argv: ['bun', '/opt/nixie/conversation/src/main.ts'], env: {} },
        getSystemPrompt: () => 'You are nixie.',
      }),
    writeMessage: (text: string) =>
      writeInboxRecords(tasks.context, [
        {
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text },
        },
      ]),
    runNextStep: (runner: Awaited<ReturnType<typeof startConversationRunner>>) =>
      runNextStep(tasks.context, runner.runStep),
    readKinds: (kind: string) => readRecordsByKind(tasks.context.log, kind),
  };
}

test('it records each reply with the model and the profile in force, never what the model claims', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { model: 'claude-test-1' } } }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      text: 'I am model-z from another lab.',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);
  await ctx.writeMessage('Who are you?');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.reply');

  expect(records).toMatchObject([
    {
      thread: 'conversation',
      payload: {
        model: 'claude-test-1',
        profile: 'chat-direct',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
      erasable: { status: 'readable', fields: { text: 'I am model-z from another lab.' } },
    },
  ]);
});

test('it records the new model on the next reply once the conversation role points at another profile', async () => {
  const ctx = await setupTest();
  const before = await ctx.startRunner({
    models: buildMockModelsConfig({
      profiles: {
        'chat-direct': { model: 'claude-test-1' },
        'chat-aggregator': { model: 'glm-5.3' },
      },
    }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(before);

  const after = await ctx.startRunner({
    models: buildMockModelsConfig({
      profiles: {
        'chat-direct': { model: 'claude-test-1' },
        'chat-aggregator': { model: 'glm-5.3' },
      },
      roles: { conversation: 'chat-aggregator' },
    }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.writeMessage('Hi again.');
  await ctx.runNextStep(after);

  const records = await ctx.readKinds('model.reply');

  expect(records).toMatchObject([
    { payload: { model: 'claude-test-1', profile: 'chat-direct' } },
    { payload: { model: 'glm-5.3', profile: 'chat-aggregator' } },
  ]);
  expect(ctx.sandboxes.turns.map((turn) => turn.profile.model)).toStrictEqual([
    'claude-test-1',
    'glm-5.3',
  ]);
});

test('it sends the guest the profile context tokens with every turn', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({
      profiles: { 'chat-direct': { model: 'claude-test-1', contextTokens: 400_000 } },
    }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);

  expect(ctx.sandboxes.turns.map((turn) => turn.profile.contextTokens)).toStrictEqual([400_000]);
});

test('it records the model and the profile on the turn end and on every tool call', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { model: 'claude-test-1' } } }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 2,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 3, cacheWriteTokens: 4 },
    },
  ]);
  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.turn_ended');

  expect(records).toMatchObject([
    {
      payload: {
        model: 'claude-test-1',
        profile: 'chat-direct',
        stopReason: 'end_turn',
        turns: 2,
        inputTokens: 20,
        outputTokens: 10,
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
      },
    },
  ]);
  expect(ctx.runs).toStrictEqual([
    {
      runID: 'conversation',
      thread: 'conversation',
      tools: ['notes_read'],
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
  ]);
});

test('it commits the session boundary and resumes the next turn at it', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);
  await ctx.writeMessage('Remember APPLE.');
  await ctx.runNextStep(runner);
  await ctx.writeMessage('What was the word?');
  await ctx.runNextStep(runner);

  const task = await ctx.db
    .selectFrom('tasks')
    .select('session_boundary')
    .executeTakeFirstOrThrow();

  expect(task.session_boundary).toBe(
    '{"sessionID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001","messageID":"7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002"}',
  );
  expect(ctx.sandboxes.turns.map((turn) => turn.resume)).toStrictEqual([
    null,
    {
      sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
    },
  ]);
});

test('it sends each inbox record with its sequence as the message uuid and acknowledges what the model read', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: [turn.input[0]?.uuid ?? ''] },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await ctx.writeMessage('First.');
  await ctx.writeMessage('Second.');

  await ctx.runNextStep(runner);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'read_cursor'])
    .executeTakeFirstOrThrow();

  expect(ctx.sandboxes.turns[0]?.input).toStrictEqual([
    { uuid: '6e697869-0000-8000-8000-000000000002', text: 'First.' },
    { uuid: '6e697869-0000-8000-8000-000000000003', text: 'Second.' },
  ]);
  expect(task).toStrictEqual({ state: 'ready', read_cursor: 2 });
});

test('it starts a fresh session and records the reset when the guest has lost the session', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { model: 'claude-test-1' } } }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) =>
    turn.resume === null
      ? [
          {
            type: 'ended',
            boundary: {
              sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
              messageID: crypto.randomUUID(),
            },
            subtype: 'success',
            stopReason: 'end_turn',
            turns: 1,
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
        ]
      : [{ type: 'failed', reason: 'session_missing', detail: 'No conversation found' }],
  );
  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);
  await ctx.writeMessage('Hi again.');
  await ctx.runNextStep(runner);

  expect(ctx.sandboxes.turns.map((turn) => turn.resume?.sessionID ?? null)).toStrictEqual([
    null,
    '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    null,
  ]);
  const records = await ctx.readKinds('model.session_reset');

  expect(records).toMatchObject([
    {
      payload: {
        model: 'claude-test-1',
        profile: 'chat-direct',
        lostSessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      },
    },
  ]);
});

test('it fails the step and records no reply when nixie tool server is not connected', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    { type: 'assistant', messageID: crypto.randomUUID(), text: 'Made up.', toolUses: [] },
    { type: 'failed', reason: 'tools_not_connected', detail: "nixie's tool server is failed" },
  ]);
  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'step_errors', 'read_cursor'])
    .executeTakeFirstOrThrow();

  const records = await ctx.readKinds('model.reply');

  expect(records).toStrictEqual([]);
  expect(task).toStrictEqual({ state: 'ready', step_errors: 1, read_cursor: 0 });
});

test('it passes a message that lands during the turn into it and acknowledges it', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });
  const live = { sequence: 0 };

  ctx.sandboxes.setGuestScript(async (turn, guest) => {
    const [record] = await ctx.writeMessage('Also eggs.');
    const message = await guest.waitForMessage();

    live.sequence = record?.sequence ?? 0;
    return [
      { type: 'read', uuids: [turn.input[0]?.uuid ?? '', message.uuid] },
      {
        type: 'ended',
        boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
        subtype: 'success',
        stopReason: 'end_turn',
        turns: 1,
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    ];
  });
  await ctx.writeMessage('Buy milk.');
  await ctx.runNextStep(runner);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'read_cursor'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'waiting', read_cursor: live.sequence });
});

test('it stores the profile credential and grants it to the conversation sandbox alone', async () => {
  const ctx = await setupTest();

  await ctx.startRunner({
    models: buildMockModelsConfig({
      profiles: {
        'chat-direct': { baseURL: 'https://api.anthropic.com', authHeader: 'x-api-key' },
      },
    }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  expect(ctx.sandboxes.secrets).toStrictEqual([
    {
      name: expect.toSatisfy((name: string) => /^model-chat-direct-[\da-f]{16}$/u.test(name)),
      value: 'not-a-real-key',
      host: 'api.anthropic.com',
      header: 'x-api-key',
    },
  ]);
  expect(ctx.sandboxes.created).toMatchObject([
    {
      kind: 'conversation',
      owner: 'conversation',
      egress: { kind: 'none' },
      toolRoute: true,
      grants: [
        {
          secret: ctx.sandboxes.secrets[0]?.name,
          host: 'api.anthropic.com',
          env: { ANTHROPIC_API_KEY: 'imp-broker-placeholder' },
        },
      ],
    },
  ]);
});

test('it opens a turn with at most the batch limit of inbox records and leaves the rest for the next step', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await Promise.all(Array.from({ length: 66 }, (_, index) => ctx.writeMessage(`Note ${index}.`)));
  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(ctx.sandboxes.turns.map((turn) => turn.input.length)).toStrictEqual([64, 2]);
  expect(task.state).toBe('waiting');
});

test('it keeps the session boundary and runs no turn for a step with nothing unread', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  const result = await runner.runStep({
    taskID: 'conversation',
    stepKey: 'conversation:4',
    lease: {
      kind: 'task',
      workID: 'conversation',
      holder: 'runner-1',
      generation: 1,
      epoch: 1,
      expiresAt: Date.now() + 60_000,
    },
    inbox: [],
    sessionBoundary: '{"sessionID":"s","messageID":"m"}',
    signal: new AbortController().signal,
  });

  expect(result).toStrictEqual({
    next: 'wait',
    records: [],
    acknowledged: [],
    sessionBoundary: '{"sessionID":"s","messageID":"m"}',
  });
  expect(ctx.sandboxes.turns).toStrictEqual([]);
});

test('it keeps the conversation sandbox across restarts on one profile and replaces it on another', async () => {
  const ctx = await setupTest();
  const profiles = {
    'chat-direct': { baseURL: 'https://api.anthropic.com' },
    'chat-aggregator': { baseURL: 'https://gateway.example/anthropic' },
  };

  await ctx.startRunner({
    models: buildMockModelsConfig({ profiles }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });
  await ctx.startRunner({
    models: buildMockModelsConfig({ profiles }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });
  await ctx.startRunner({
    models: buildMockModelsConfig({ profiles, roles: { conversation: 'chat-aggregator' } }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  expect(ctx.sandboxes.created.map((spec) => spec.grants[0]?.host)).toStrictEqual([
    'api.anthropic.com',
    'gateway.example',
  ]);
  expect(ctx.sandboxes.destroyed).toHaveLength(1);
});
