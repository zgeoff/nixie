import { expect, mock, test } from 'bun:test';
import { resolveRoleProfile } from '@heynixie/models';
import { buildMockModelsConfig } from '@heynixie/models/test-utils';
import { buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import type { ConversationRunnerOptions } from './start-conversation-runner';
import { startConversationRunner } from './start-conversation-runner';
import { buildStubToolEndpoint } from './test-utils/build-stub-tool-endpoint';
import { readRecordsByKind } from './test-utils/read-records-by-kind';
import { runNextStep } from './test-utils/run-next-step';
import { startTestTasks } from './test-utils/start-test-tasks';

interface RunnerConfig {
  readonly models: ReturnType<typeof buildMockModelsConfig>;
  readonly credential: string;
  readonly toolNames: readonly string[];
  readonly memory?: Pick<ConversationRunnerOptions, 'readTurnNote'>;

  // a recorder for the server's log, for a test that reads its warnings
  readonly log?: ConversationRunnerOptions['log'];
}

type Runner = Awaited<ReturnType<typeof startConversationRunner>>;

// the stub sandboxes and tool endpoint over a fresh log; sendMessage writes your message, then runs
// the step that takes it
async function setupTest() {
  const tasks = await startTestTasks();

  const sandboxes = buildStubSandboxes();
  const tools = buildStubToolEndpoint();

  const writeMessage = (text: string) =>
    writeInboxRecords(tasks.context, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text },
      },
    ]);

  return {
    ...tasks,
    sandboxes,
    runs: tools.runs,
    steps: tools.steps,
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
        ...config.memory,
        memory: () => ({
          readPinnedCore: () => Promise.resolve([]),
          recall: () => Promise.resolve({ items: [], next: null }),
          readShortIDs: () => Promise.resolve(new Map()),
        }),
        log: config.log ?? (() => {}),
      }),
    writeMessage,
    runNextStep: (runner: Runner) => runNextStep(tasks.context, runner.runStep),
    sendMessage: async (runner: Runner, text: string) => {
      await writeMessage(text);
      await runNextStep(tasks.context, runner.runStep);
    },
    readKinds: (kind: string) => readRecordsByKind(tasks.context.log, kind),
  };
}

test('it records each reply with the model and the profile in force, never what the model claims', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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

  await createConversationTask(ctx.context);

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

  await ctx.sendMessage(before, 'Hi.');

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

  await ctx.sendMessage(after, 'Hi again.');

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

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({
      profiles: { 'chat-direct': { model: 'claude-test-1', contextTokens: 400_000 } },
    }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');

  expect(ctx.sandboxes.turns.map((turn) => turn.profile.contextTokens)).toStrictEqual([400_000]);
});

test("it gives each turn a step token of the step's run identity, and stops it once the turn ends", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');
  await ctx.sendMessage(runner, 'Are you there?');

  expect(ctx.sandboxes.turns.map((turn) => turn.tools.token)).toStrictEqual([
    'step-token-1',
    'step-token-2',
  ]);

  expect(ctx.steps).toStrictEqual([
    { stepRunID: 'conversation:1@1', token: 'step-token-1', isStopped: true },
    { stepRunID: 'conversation:2@2', token: 'step-token-2', isStopped: true },
  ]);
});

test('it records the model and the profile on the turn end and on every tool call', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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

  await ctx.sendMessage(runner, 'Hi.');

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

test('it records the context of the last model call that reported one on the turn end', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 200, outputTokens: 5, cacheReadTokens: 30_000, cacheWriteTokens: 4000 },
      context: { size: 34_200, window: 400_000 },
    },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 300, outputTokens: 5, cacheReadTokens: 38_000, cacheWriteTokens: 2700 },
      context: { size: 41_000, window: 400_000 },
    },
  ]);

  await ctx.sendMessage(runner, 'Hi.');

  const records = await ctx.readKinds('model.turn_ended');

  expect(records).toMatchObject([
    {
      payload: {
        inputTokens: 500,
        cacheReadTokens: 68_000,
        cacheWriteTokens: 6700,
        contextSize: 41_000,
        contextWindow: 400_000,
      },
    },
  ]);
});

test('it records no context on a turn end whose model calls reported none', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'stop_sequence',
      isError: true,
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await ctx.sendMessage(runner, 'Hi.');

  const records = await ctx.readKinds('model.turn_ended');

  expect(
    records.map((record) => 'contextSize' in record.payload || 'contextWindow' in record.payload),
  ).toStrictEqual([false]);
});

test('it records the reason each turn ended on its turn end', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      terminalReason: 'completed',
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await ctx.sendMessage(runner, 'Hi.');

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

  await ctx.sendMessage(runner, 'Are you there?');

  const records = await ctx.readKinds('model.turn_ended');

  expect(records.map((record) => record.payload['terminalReason'])).toStrictEqual([
    'completed',
    'api_error',
  ]);
});

test('it commits the session boundary and resumes the next turn at it', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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

  await ctx.sendMessage(runner, 'Remember APPLE.');
  await ctx.sendMessage(runner, 'What was the word?');

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

test('it sends each inbox record with its sequence as the message uuid and at the head of its stamp, and acknowledges what the model read', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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
    {
      uuid: '6e697869-0000-8000-8000-000000000002',
      text: expect.toSatisfy((text: string) =>
        /^<system-message type="pinned-memory"[\s\S]+<\/system-message id="[\da-f]{12}">\n\n\[#2 · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] First\.$/u.test(
          text,
        ),
      ),
    },
    {
      uuid: '6e697869-0000-8000-8000-000000000003',
      text: expect.toSatisfy((text: string) =>
        /^\[#3 · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Second\.$/u.test(text),
      ),
    },
  ]);

  expect(task).toStrictEqual({ state: 'ready', read_cursor: 2 });
});

test('it rebuilds the session with the recent turns when the guest has lost the session', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { model: 'claude-test-1' } } }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) =>
    turn.resume === null
      ? [
          { type: 'read', uuids: turn.input.map((message) => message.uuid) },
          { type: 'assistant', messageID: crypto.randomUUID(), text: 'Hello.', toolUses: [] },
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

  await ctx.sendMessage(runner, 'Hi.');
  await ctx.sendMessage(runner, 'Hi again.');

  expect(ctx.sandboxes.turns.map((turn) => turn.resume?.sessionID ?? null)).toStrictEqual([
    null,
    '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    null,
  ]);

  expect(ctx.sandboxes.turns.at(-1)?.input).toStrictEqual([
    {
      uuid: expect.toBeString(),
      text: expect.toSatisfy(
        (text: string) =>
          text.includes('- Start: a rebuild, because the earlier session was lost.') &&
          text.includes('] owner: Hi.\n[') &&
          text.includes('] nixie: Hello.\n</system-message') &&
          /\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi again\.$/u.test(text),
      ),
    },
  ]);
});

test('it gives a resumed session your next message after its send time, with no recap of the last turn', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { timeZone: 'Australia/Sydney' },
      erasable: { text: 'Hi.' },
    },
  ]);

  await ctx.runNextStep(runner);
  await ctx.sendMessage(runner, 'Hi again.');

  expect(ctx.sandboxes.turns.at(-1)).toMatchObject({
    resume: expect.toBeObject(),
    input: [
      {
        uuid: expect.toBeString(),
        text: expect.toSatisfy((text: string) =>
          /^\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi again\.$/u.test(text),
        ),
      },
    ],
  });
});

test('it records the opening and the session it replaced when the guest has lost the session', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({ profiles: { 'chat-direct': { model: 'claude-test-1' } } }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) =>
    turn.resume === null
      ? [
          { type: 'read', uuids: turn.input.map((message) => message.uuid) },
          { type: 'assistant', messageID: crypto.randomUUID(), text: 'Hello.', toolUses: [] },
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

  await ctx.sendMessage(runner, 'Hi.');
  await ctx.sendMessage(runner, 'Hi again.');

  const records = await ctx.readKinds('model.session_opened');

  expect(records).toMatchObject([
    { payload: { kind: 'first' } },
    {
      payload: {
        model: 'claude-test-1',
        profile: 'chat-direct',
        kind: 'rebuild',
        reason: 'lost',
        lostSessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        recentRecords: 2,
        status: { start: 'rebuild:lost', model: 'claude-test-1' },
      },
    },
  ]);
});

test('it rebuilds the session when your next images would pass the images the session can hold', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: {
        sessionID: '5e2a9c71-4b0d-4f6e-8a3b-2d7c1e9f0a11',
        messageID: crypto.randomUUID(),
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  // 10 MiB reads as about 14 MiB in base64, so a session holds one such photo and not two
  const photo = {
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    payload: { images: [{ mediaType: 'image/jpeg' }] },
    erasable: { text: 'The garden bed.' },
    attachments: [new Uint8Array(10 * 1024 * 1024).fill(7)],
  };

  await writeInboxRecords(ctx.context, [photo, photo]);

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.session_opened');

  expect(records).toMatchObject([
    { payload: { kind: 'first' } },
    {
      payload: {
        kind: 'rebuild',
        reason: 'images',
        lostSessionID: '5e2a9c71-4b0d-4f6e-8a3b-2d7c1e9f0a11',
        status: { start: 'rebuild:images' },
      },
    },
  ]);
}, 60_000);

test('it rebuilds the session when your next images would pass the 100 it can hold, however small', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: {
        sessionID: '8b4e2f60-1c7a-4d93-b5e8-3f0a6c2d9e17',
        messageID: crypto.randomUUID(),
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  // 26 messages of 4 small icons each come to 104 images and a few hundred bytes
  await writeInboxRecords(
    ctx.context,
    Array.from({ length: 26 }, () => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: Array.from({ length: 4 }, () => ({ mediaType: 'image/png' })) },
      erasable: { text: 'Four more icons.' },
      attachments: Array.from({ length: 4 }, () => new Uint8Array(6).fill(3)),
    })),
  );

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  expect(
    ctx.sandboxes.turns.map((turn) => turn.input.flatMap((message) => message.images ?? []).length),
  ).toStrictEqual([100, 4]);

  const opened = await ctx.readKinds('model.session_opened');

  expect(opened).toMatchObject([
    { payload: { kind: 'first' } },
    { payload: { kind: 'rebuild', reason: 'images', status: { start: 'rebuild:images' } } },
  ]);
});

test('it resumes the session for a photo while the images it holds leave room', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: {
        sessionID: '5e2a9c71-4b0d-4f6e-8a3b-2d7c1e9f0a11',
        messageID: crypto.randomUUID(),
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  // 5 MiB reads as about 7 MiB in base64, so a session holds both photos
  const photo = {
    kind: 'owner_message',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    payload: { images: [{ mediaType: 'image/jpeg' }] },
    erasable: { text: 'The garden bed.' },
    attachments: [new Uint8Array(5 * 1024 * 1024).fill(7)],
  };

  await writeInboxRecords(ctx.context, [photo]);

  await ctx.runNextStep(runner);

  await writeInboxRecords(ctx.context, [photo]);

  await ctx.runNextStep(runner);

  expect(ctx.sandboxes.turns.at(-1)?.resume?.sessionID).toBe(
    '5e2a9c71-4b0d-4f6e-8a3b-2d7c1e9f0a11',
  );
}, 60_000);

test('it opens the first turn on a fresh session with the pinned memory and the status, and records the opening', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');

  const opened = await ctx.readKinds('model.session_opened');

  expect(ctx.sandboxes.turns.map((turn) => turn.input)).toStrictEqual([
    [
      {
        uuid: '6e697869-0000-8000-8000-000000000002',
        text: expect.toSatisfy((text: string) =>
          /^<system-message type="pinned-memory" id="(?<pinnedID>[\da-f]{12})" at="[^"]+">\nNothing is pinned in your memory\.\n<\/system-message id="\k<pinnedID>">\n\n<system-message type="status" id="(?<statusID>[\da-f]{12})" at="[^"]+">\n- Start: a new session\. Earlier history is in the event log\.\n- Session started: [^\n]+\n- Model: [^\n]+\n<\/system-message id="\k<statusID>">\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi\.$/u.test(
            text,
          ),
        ),
      },
    ],
  ]);

  expect(opened).toMatchObject([
    { payload: { kind: 'first', reason: null, summarySequence: null, recentRecords: 0 } },
  ]);
});

test('it opens the first turn after a forget with a status that says so, and resumes the turn after it with no opening', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');
  await runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' });
  await ctx.sendMessage(runner, 'Hi again.');
  await ctx.sendMessage(runner, 'And again.');

  const [, rebuilt, resumed] = ctx.sandboxes.turns;

  expect(rebuilt?.input).toStrictEqual([
    {
      uuid: expect.toBeString(),
      text: expect.toSatisfy(
        (text: string) =>
          text.startsWith('<system-message type="pinned-memory"') &&
          text.includes('- Start: a rebuild after a forget.') &&
          text.includes('<system-message type="recent-turns"') &&
          /\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi again\.$/u.test(text),
      ),
    },
  ]);

  expect(resumed).toMatchObject({
    resume: expect.toBeObject(),
    input: [
      {
        uuid: expect.toBeString(),
        text: expect.toSatisfy((text: string) =>
          /^\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] And again\.$/u.test(text),
        ),
      },
    ],
  });
});

test('it opens a session from before opening records again as a rebuild, because only its old system prompt held the core', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.writeMessage('Hi.');

  // a step from before opening records committed its session with no opening record
  await runNextStep(ctx.context, () =>
    Promise.resolve({
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: JSON.stringify({
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '5d2b1e0c-7f3a-4e8b-9c6d-2a1b3c4d5e6f',
      }),
    }),
  );

  await ctx.sendMessage(runner, 'Hi again.');

  const opened = await ctx.readKinds('model.session_opened');

  expect(ctx.sandboxes.turns.map((turn) => turn.resume)).toStrictEqual([null]);

  expect(opened).toMatchObject([
    {
      payload: {
        kind: 'rebuild',
        reason: 'lost',
        lostSessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
      },
    },
  ]);
});

test('it invalidates the session, removes the guest session state and records the cleanup on a forget', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' });

  const invalidated = await ctx.readKinds('model.session_invalidated');
  const completed = await ctx.readKinds('model.session_cleanup_completed');

  expect(ctx.sandboxes.purged).toHaveLength(1);

  expect(invalidated).toMatchObject([
    { thread: 'conversation', payload: { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' } },
  ]);

  expect(completed).toMatchObject([
    { thread: 'conversation', payload: { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' } },
  ]);

  expect(completed.at(0)?.sequence).toBeGreaterThan(invalidated.at(0)?.sequence ?? Infinity);
});

test('it names the forgotten record in the cleanup records of a record forget', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await runner.cleanupSessions({ recordSequence: 12 });

  const invalidated = await ctx.readKinds('model.session_invalidated');
  const completed = await ctx.readKinds('model.session_cleanup_completed');

  expect(ctx.sandboxes.purged).toHaveLength(1);
  expect(invalidated).toMatchObject([{ thread: 'conversation', payload: { recordSequence: 12 } }]);
  expect(completed).toMatchObject([{ thread: 'conversation', payload: { recordSequence: 12 } }]);
});

test('it rebuilds the session on the turn after a forget invalidated it, and records why', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');
  await runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' });
  await ctx.sendMessage(runner, 'Hi again.');

  const opened = await ctx.readKinds('model.session_opened');

  expect(ctx.sandboxes.turns.map((turn) => turn.resume)).toStrictEqual([null, null]);

  expect(opened).toMatchObject([
    { payload: { kind: 'first' } },
    {
      payload: {
        kind: 'rebuild',
        reason: 'forget',
        lostSessionID: expect.toBeString(),
        recentRecords: 2,
      },
    },
  ]);
});

test('it records the invalidation each turn saw, and resumes the rebuilt session on the turn after', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');
  await runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' });
  await ctx.sendMessage(runner, 'Hi again.');
  await ctx.sendMessage(runner, 'And again.');

  const ended = await ctx.readKinds('model.turn_ended');

  expect(ctx.sandboxes.turns.map((turn) => turn.resume === null)).toStrictEqual([
    true,
    true,
    false,
  ]);

  expect(ended.map((record) => record.payload['invalidatedThrough'])).toStrictEqual([
    0,
    expect.toBePositive(),
    expect.toBePositive(),
  ]);
});

test('it aborts a running turn on a forget, and fails the step so it retries on a new session', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  const started = Promise.withResolvers<void>();

  // the guest holds its turn until the host stops it
  ctx.sandboxes.setGuestScript(async (_turn, guest) => {
    started.resolve();

    await guest.waitForMessage();

    return [];
  });

  await ctx.writeMessage('Hi.');

  await Promise.all([
    ctx.runNextStep(runner),
    started.promise.then(() =>
      runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' }),
    ),
  ]);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['session_boundary', 'step_errors'])
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ session_boundary: null, step_errors: 1 });
});

test('it fails the step and records no reply when nixie tool server is not connected', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    { type: 'assistant', messageID: crypto.randomUUID(), text: 'Made up.', toolUses: [] },
    { type: 'failed', reason: 'tools_not_connected', detail: "nixie's tool server is failed" },
  ]);

  await ctx.sendMessage(runner, 'Hi.');

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'step_errors', 'read_cursor'])
    .executeTakeFirstOrThrow();

  const records = await ctx.readKinds('model.reply');

  expect(records).toStrictEqual([]);
  expect(task).toStrictEqual({ state: 'ready', step_errors: 1, read_cursor: 0 });
});

test('it answers your next message after 4 turns failed in a row, past the error limit of 3', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    { type: 'failed', reason: 'tools_not_connected', detail: "nixie's tool server is failed" },
  ]);

  await ['Hi.', 'Hello?', 'Anyone?', 'Still there?'].reduce(
    (sent, text) => sent.then(() => ctx.sendMessage(runner, text)),
    Promise.resolve(),
  );

  ctx.sandboxes.setGuestScript(() => [
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      text: 'I am here.',
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

  await ctx.sendMessage(runner, 'Are you there?');

  const [replies, errored] = await Promise.all([
    ctx.readKinds('model.reply'),
    ctx.readKinds('task.step_errored'),
  ]);

  expect(replies).toMatchObject([
    { erasable: { status: 'readable', fields: { text: 'I am here.' } } },
  ]);

  expect(errored).toHaveLength(4);
});

test('it passes a message that lands during the turn into it and acknowledges it', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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

  await createConversationTask(ctx.context);

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

  await createConversationTask(ctx.context);

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

  await createConversationTask(ctx.context);

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

  await createConversationTask(ctx.context);

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

test('it tries every replaced sandbox for the session and logs one warning that names each', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const before = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(before, 'Hi.');

  const existing = await ctx.sandboxes.adapter.list('conversation');

  await Promise.all(
    existing.map((sandbox) =>
      ctx.sandboxes.adapter.create({ ...sandbox.spec, image: 'conversation-stale' }),
    ),
  );

  const replaced = await ctx.sandboxes.adapter.list('conversation');

  const log = mock<ConversationRunnerOptions['log']>();

  // a rotated credential changes the grant, which replaces the sandbox
  await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'another-not-real-key',
    toolNames: ['notes_read'],
    log,
  });

  expect(log).toHaveBeenCalledExactlyOnceWith('conversation.session_copy_failed', {
    toSandboxID: expect.toBeString(),
    reason: expect.toSatisfy((reason: string) =>
      replaced.every((sandbox) => reason.includes(sandbox.id)),
    ),
  });
});

test('it puts the memory note before the first message of the turn and leaves the rest as sent', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    memory: {
      readTurnNote: () =>
        Promise.resolve({
          text: 'Memory changed: you moved to Lisbon.',
          throughSequence: 7,
          eventCount: 0,
        }),
    },
  });

  await ctx.writeMessage('First.');
  await ctx.writeMessage('Second.');
  await ctx.runNextStep(runner);

  expect(ctx.sandboxes.turns[0]?.input).toStrictEqual([
    {
      uuid: '6e697869-0000-8000-8000-000000000002',
      text: expect.toSatisfy((text: string) =>
        /^<system-message type="pinned-memory"[\s\S]+<\/system-message id="[\da-f]{12}">\n\nMemory changed: you moved to Lisbon\.\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] First\.$/u.test(
          text,
        ),
      ),
    },
    {
      uuid: '6e697869-0000-8000-8000-000000000003',
      text: expect.toSatisfy((text: string) =>
        /^\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Second\.$/u.test(text),
      ),
    },
  ]);
});

test('it records the sequence the memory note covers on the turn end', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    memory: {
      readTurnNote: () =>
        Promise.resolve({
          text: 'Memory changed: you moved to Lisbon.',
          throughSequence: 7,
          eventCount: 0,
        }),
    },
  });

  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.turn_ended');

  expect(records).toMatchObject([{ payload: { memoryNotedThrough: 7 } }]);
});

test('it records the sequence a turn with no memory changes covers and adds no memory note', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    memory: {
      readTurnNote: () => Promise.resolve({ text: null, throughSequence: 4, eventCount: 0 }),
    },
  });

  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.turn_ended');

  expect(ctx.sandboxes.turns[0]?.input).toStrictEqual([
    {
      uuid: '6e697869-0000-8000-8000-000000000002',
      text: expect.toSatisfy((text: string) =>
        /^<system-message type="pinned-memory"[\s\S]+<\/system-message id="[\da-f]{12}">\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Hi\.$/u.test(
          text,
        ),
      ),
    },
  ]);

  expect(records).toMatchObject([{ payload: { memoryNotedThrough: 4 } }]);
});

test('it records no noted sequence on the turn end of a runner with no memory note', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.writeMessage('Hi.');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.turn_ended');

  expect(records).toStrictEqual([
    expect.objectContaining({
      payload: expect.toSatisfy((payload: object) => !('memoryNotedThrough' in payload)),
    }),
  ]);
});
