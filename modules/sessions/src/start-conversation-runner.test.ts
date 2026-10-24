import { expect, mock, test } from 'bun:test';
import { resolveRoleProfile } from '@heynixie/models';
import { buildMockModelsConfig } from '@heynixie/models/test-utils';
import { buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import {
  claimTask,
  createConversationTask,
  createSystemTask,
  writeInboxRecords,
  writeTaskMessage,
} from '@heynixie/tasks';
import { sql } from 'kysely';
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
  readonly memory?: Pick<ConversationRunnerOptions, 'readTurnNote' | 'loadOrPinSkillCatalog'>;

  readonly log?: ConversationRunnerOptions['log'];

  readonly getDefinitions?: ConversationRunnerOptions['getDefinitions'];
  readonly messaging?: ConversationRunnerOptions['messaging'];
}

type Runner = Awaited<ReturnType<typeof startConversationRunner>>;

async function setupTest() {
  const tasks = await startTestTasks();

  const testDefinitions = {
    persona: 'You are nixie.',
    prompts: {},
    personaHash: 'sha256:persona-test',
    policyHash: 'sha256:policy-test',
  };

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
        getDefinitions: config.getDefinitions ?? (() => testDefinitions),
        ...config.memory,
        memory: () => ({
          readPinnedCore: () => Promise.resolve([]),
          readPinnedCoreUse: () => Promise.resolve({ items: 0, tokens: 0, budget: 2000 }),
          recall: () => Promise.resolve({ items: [], next: null }),
          recallMessages: () => Promise.resolve({ messages: [] }),
          readShortIDs: () => Promise.resolve(new Map()),
        }),
        log: config.log ?? (() => {}),
        ...(config.messaging === undefined ? {} : { messaging: config.messaging }),
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

test('it records the reply with the turn summary in its erasable fields and the thinking tokens in its payload', async () => {
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
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d010',
      text: '',
      toolUses: [],
      summary: 'I compared the ferries by arrival time.',
    },
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      text: 'The 09:25 ferry reaches the north pier by 08:55.',
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
      thinkingTokens: 236,
    },
  ]);

  await ctx.writeMessage('Which ferry?');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.reply');

  expect(records).toMatchObject([
    {
      thread: 'conversation',
      payload: {
        model: 'claude-test-1',
        profile: 'chat-direct',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
        thinkingTokens: 236,
      },
      erasable: {
        status: 'readable',
        fields: {
          text: 'The 09:25 ferry reaches the north pier by 08:55.',
          summary: 'I compared the ferries by arrival time.',
        },
      },
    },
  ]);
});

test('it joins the turn summaries onto the last reply and records the thinking tokens there alone', async () => {
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
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d022',
      text: '',
      toolUses: [],
      summary: 'I list the ferries.',
    },
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d020',
      text: 'Let me check the timetable.',
      toolUses: [],
    },
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d023',
      text: '',
      toolUses: [],
      summary: 'The 09:25 reaches the pier by 08:55.',
    },
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d021',
      text: 'Take the 09:25 ferry.',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d021',
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      thinkingTokens: 300,
    },
  ]);

  await ctx.writeMessage('Which ferry?');
  await ctx.runNextStep(runner);

  const records = await ctx.readKinds('model.reply');

  expect(records).toHaveLength(2);

  expect(records.at(0)?.payload).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d020',
  });

  expect(records.at(0)?.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'Let me check the timetable.' },
  });

  expect(records.at(1)?.payload).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d021',
    thinkingTokens: 300,
  });

  expect(records.at(1)?.erasable).toStrictEqual({
    status: 'readable',
    fields: {
      text: 'Take the 09:25 ferry.',
      summary: 'I list the ferries.\n\nThe 09:25 reaches the pier by 08:55.',
    },
  });
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

test('it sends the guest the profile cache lifetime with every turn', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig({
      profiles: { 'chat-direct': { model: 'claude-test-1', cacheTTL: '1h' } },
    }),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');

  expect(ctx.sandboxes.turns.map((turn) => turn.profile.cacheTTL)).toStrictEqual(['1h']);
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
    {
      stepRunID: 'conversation:1@1',
      session: { key: expect.toBeString(), invalidatedThrough: 0 },
      token: 'step-token-1',
      isStopped: true,
    },
    {
      stepRunID: 'conversation:2@2',
      session: { key: expect.toBeString(), invalidatedThrough: 0 },
      token: 'step-token-2',
      isStopped: true,
    },
  ]);
});

test("it gives each turn of a session the key the session's opening keeps, and a session after a forget a new key", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await ctx.sendMessage(runner, 'Hi.');
  await ctx.sendMessage(runner, 'Are you there?');
  await runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' });
  await ctx.sendMessage(runner, 'Hi again.');

  const opened = await ctx.readKinds('model.session_opened');

  const keys: unknown[] = opened.map((record) => record.payload['sessionKey']);
  const stepKeys: unknown[] = ctx.steps.map((step) => step.session?.key);

  expect(keys).toStrictEqual([expect.toBeString(), expect.toBeString()]);
  expect(keys[1]).not.toBe(keys[0]);
  expect(stepKeys).toStrictEqual([keys[0], keys[0], keys[1]]);
});

test("it removes the thread's web fetch links on a forget", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  await sql`insert into web_fetch_links (session_key, number, url, thread) values
    ('session-a', 1, 'https://pier.test/a', 'conversation'),
    ('session-c', 1, 'https://pier.test/c', 'task-tides')`.execute(ctx.context.log.writer.db);

  await runner.cleanupSessions({ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' });

  const links = await sql`select thread from web_fetch_links`.execute(ctx.context.log.writer.db);

  expect(links.rows).toStrictEqual([{ thread: 'task-tides' }]);
});

test("it hands each turn's tool calls the newest invalidation the step saw", async () => {
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

  const [invalidated] = await ctx.readKinds('model.session_invalidated');

  expect(ctx.steps.map((step) => step.session?.invalidatedThrough)).toStrictEqual([
    0,
    invalidated?.sequence,
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

test("it wakes the conversation for a system task's message and gives the turn the framed block", async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'memory-writer', name: 'Memory writer', brief: 'Saves.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  };

  await createConversationTask(ctx.context);
  await createSystemTask(ctx.context, 'memory-writer');
  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['task.message'],
    messaging,
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await writeTaskMessage(ctx.context, messaging, {
    from: 'memory-writer',
    to: 'conversation',
    kind: 'report',
    body: 'Two new memories wait for your review.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await ctx.runNextStep(runner);

  expect(ctx.sandboxes.turns[0]?.input.at(-1)?.text).toMatch(
    /<task-message id="\w+" from="memory-writer" name="Memory writer" kind="report" sent="[^"]+" age="under a minute" hop="1" reply-wakes="yes" block="(?<block>\w+)">\nThis message is from another task, not from Robin\.\nTwo new memories wait for your review\.\n<\/task-message block="\k<block>">$/u,
  );
});

test('it gives the next turn a message sent with no wake, before the message that woke it', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'memory-writer', name: 'Memory writer', brief: 'Saves.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
    ownerName: 'Robin',
  };

  await createConversationTask(ctx.context);
  await createSystemTask(ctx.context, 'memory-writer');
  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['task.message'],
    messaging,
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await writeTaskMessage(ctx.context, messaging, {
    from: 'memory-writer',
    to: 'conversation',
    kind: 'progress',
    body: 'Halfway through the backlog.',
    replyTo: null,
    onBehalfOf: [],
    wake: false,
  });

  await ctx.sendMessage(runner, 'Anything new?');

  const input = ctx.sandboxes.turns[0]?.input ?? [];

  expect(input).toHaveLength(2);
  expect(input[0]?.text).toInclude('kind="progress"');
  expect(input[1]?.text).toEndWith('Anything new?');
});

test('it tells the conversation its reply will not wake a task once the reply would pass the hop limit', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'memory-writer', name: 'Memory writer', brief: 'Saves.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 1,
    ownerName: 'Robin',
  };

  await createConversationTask(ctx.context);
  await createSystemTask(ctx.context, 'memory-writer');
  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['task.message'],
    messaging,
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await writeTaskMessage(ctx.context, messaging, {
    from: 'memory-writer',
    to: 'conversation',
    kind: 'question',
    body: 'Keep the bike note?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await ctx.runNextStep(runner);

  expect(ctx.sandboxes.turns[0]?.input.at(-1)?.text).toInclude('hop="1" reply-wakes="no"');
});

test('it tells the conversation which messages arrived past the hop limit when the owner wakes it', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'memory-writer', name: 'Memory writer', brief: 'Saves.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 2,
    ownerName: 'Robin',
  };

  await createConversationTask(ctx.context);
  await createSystemTask(ctx.context, 'memory-writer');
  await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  await ctx.db
    .updateTable('tasks')
    .set({ step_hop: 2 })
    .where('task_id', '=', 'memory-writer')
    .execute();

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['task.message'],
    messaging,
  });

  ctx.sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'ended',
      boundary: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await writeTaskMessage(ctx.context, messaging, {
    from: 'memory-writer',
    to: 'conversation',
    kind: 'chat',
    body: 'One more thought.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await ctx.sendMessage(runner, 'Morning.');

  expect(ctx.sandboxes.turns[0]?.input[0]?.text).toInclude(
    '1 message from Memory writer arrived after the exchange reached its limit, so it did not wake you. You woke for a message from Robin, so a reply from you will wake Memory writer.',
  );
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

  const photo = {
    kind: 'owner_message' as const,
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

  const photo = {
    kind: 'owner_message' as const,
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

test('it records the persona and policy hashes in force on the opening of a session', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    getDefinitions: () => ({
      persona: 'You are Wren, a calm helper.',
      prompts: {},
      personaHash: 'sha256:persona-wren',
      policyHash: 'sha256:policy-read-only',
    }),
  });

  await ctx.sendMessage(runner, 'Hi.');

  const opened = await ctx.readKinds('model.session_opened');

  expect(opened).toMatchObject([
    {
      payload: {
        kind: 'first',
        personaHash: 'sha256:persona-wren',
        policyHash: 'sha256:policy-read-only',
      },
    },
  ]);
});

test('it puts the skill catalog of the conversation in the system prompt after the persona', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const loadOrPinSkillCatalog = mock(() =>
    Promise.resolve('<skills>\n- tide-tables: Reads a tide table.\n</skills>'),
  );

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    memory: { loadOrPinSkillCatalog },
  });

  await ctx.sendMessage(runner, 'When is high water?');

  expect(loadOrPinSkillCatalog).toHaveBeenCalledExactlyOnceWith('conversation');

  expect(ctx.sandboxes.turns).toMatchObject([
    {
      systemPrompt: expect.toStartWith(
        'You are nixie.\n\n<skills>\n- tide-tables: Reads a tide table.\n</skills>\n\n',
      ),
    },
  ]);
});

test('it opens a new session under the new persona on the turn after the persona changes, and records why', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const definitions = {
    current: {
      persona: 'You are Wren, a calm helper.',
      prompts: {},
      personaHash: 'sha256:persona-wren',
      policyHash: 'sha256:policy-read-only',
    },
  };

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    getDefinitions: () => definitions.current,
  });

  await ctx.sendMessage(runner, 'Hi.');

  definitions.current = {
    persona: 'You are Wren, a cheerful helper.',
    prompts: {},
    personaHash: 'sha256:persona-wren-cheerful',
    policyHash: 'sha256:policy-read-only',
  };

  await ctx.sendMessage(runner, 'Still there?');

  expect(ctx.sandboxes.turns).toMatchObject([
    { resume: null, systemPrompt: expect.toInclude('You are Wren, a calm helper.') },
    { resume: null, systemPrompt: expect.toInclude('You are Wren, a cheerful helper.') },
  ]);

  const opened = await ctx.readKinds('model.session_opened');

  expect(opened).toMatchObject([
    { payload: { kind: 'first', personaHash: 'sha256:persona-wren' } },
    {
      payload: {
        kind: 'rebuild',
        reason: 'persona',
        lostSessionID: expect.toBeString(),
        personaHash: 'sha256:persona-wren-cheerful',
        policyHash: 'sha256:policy-read-only',
      },
    },
  ]);
});

test('it resumes the same session on the turn after a change to the policy alone', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const definitions = {
    current: {
      persona: 'You are Wren, a calm helper.',
      prompts: {},
      personaHash: 'sha256:persona-wren',
      policyHash: 'sha256:policy-read-only',
    },
  };

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
    getDefinitions: () => definitions.current,
  });

  await ctx.sendMessage(runner, 'Hi.');

  definitions.current = { ...definitions.current, policyHash: 'sha256:policy-allow-send' };

  await ctx.sendMessage(runner, 'Still there?');

  const opened = await ctx.readKinds('model.session_opened');

  expect(ctx.sandboxes.turns).toMatchObject([
    { resume: null },
    { resume: { sessionID: expect.toBeString() } },
  ]);

  expect(opened).toMatchObject([
    { payload: { kind: 'first', policyHash: 'sha256:policy-read-only' } },
  ]);
});

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

test('it fails the step with a credential error and records no reply when the model API refuses the credential', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner({
    models: buildMockModelsConfig(),
    credential: 'not-a-real-key',
    toolNames: ['notes_read'],
  });

  ctx.sandboxes.setGuestScript(() => [
    { type: 'failed', reason: 'model_auth', detail: 'Invalid API key · Fix external API key' },
  ]);

  await ctx.sendMessage(runner, 'Hi.');

  const [replies, errored] = await Promise.all([
    ctx.readKinds('model.reply'),
    ctx.readKinds('task.step_errored'),
  ]);

  expect(replies).toStrictEqual([]);

  expect(errored).toMatchObject([
    {
      payload: { errors: 1, nextState: 'ready' },
      erasable: {
        fields: {
          message:
            'the conversation turn failed: the model API refused the credential: Invalid API key · Fix external API key',
        },
      },
    },
  ]);
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
      name: expect.toSatisfy((name: string) => /^nixie-model-[\da-f]{19}$/u.test(name)),
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
          env: { ANTHROPIC_API_KEY: 'nixie-broker-placeholder' },
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
    wake: { hop: 0, cause: { kind: 'carried' } },
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
