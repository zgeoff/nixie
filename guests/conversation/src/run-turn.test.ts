import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, InboxMessage } from '@heynixie/wire';
import { runTurn } from './run-turn';
import { buildStubToolServer } from './test-utils/build-stub-tool-server';
import { startStubModel } from './test-utils/start-stub-model';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-conversation-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  const frames: GuestFrame[] = [];
  const options: Options[] = [];
  const tools = buildStubToolServer();

  return {
    home,
    model,
    tools,
    frames,
    options,

    // the host's side of the running turn's message stream
    channel: new TransformStream<InboxMessage, InboxMessage>(),
    deps: {
      // the guest's own environment: its home, its path, and the placeholder the grant replaces
      env: { HOME: home, PATH: process.env['PATH'] ?? '', ANTHROPIC_API_KEY: 'imp-placeholder' },
      toolServer: tools.config,
      messages: [],
      emit: (frame: GuestFrame) => {
        frames.push(frame);
        return Promise.resolve();
      },
      runQuery: ((params) => {
        options.push(params.options ?? {});
        return query(params);
      }) satisfies typeof query,
    },
  };
}

test('it gives every query() nixie tools alone and no settings, skills or memory', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'You need milk.' },
  );
  await runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    },
    ctx.deps,
  );

  expect(ctx.options).toStrictEqual([
    {
      tools: [],
      allowedTools: ['mcp__nixie'],
      permissionMode: 'dontAsk',
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      verbatimPrompts: true,
      settings: { disableBundledSkills: true, autoMemoryEnabled: false, autoDreamEnabled: false },
      mcpServers: { nixie: ctx.tools.config },
      systemPrompt: 'You are nixie.',
      cwd: join(ctx.home, 'conversation'),
      env: expect.any(Object),
    },
  ]);
});

test('it gives every query() the profile base URL, model and effort in its env', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello.' });
  await runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
    ctx.deps,
  );

  expect(ctx.options.map((options) => options.env)).toStrictEqual([
    {
      PATH: process.env['PATH'] ?? '',
      HOME: ctx.home,
      CLAUDE_CONFIG_DIR: join(ctx.home, '.claude'),
      ANTHROPIC_API_KEY: 'imp-placeholder',
      ANTHROPIC_BASE_URL: ctx.model.url,
      ANTHROPIC_MODEL: 'model-a',
      ANTHROPIC_SMALL_FAST_MODEL: 'model-a',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'model-a',
      CLAUDE_CODE_EFFORT_LEVEL: 'low',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      DISABLE_AUTOUPDATER: '1',
    },
  ]);
});

test('it offers the model nixie tools alone, on the profile model, with the placeholder credential', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello.' });
  await runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
    ctx.deps,
  );

  expect(ctx.model.requests.filter((request) => request.path === '/v1/messages')).toMatchObject([
    {
      headers: { 'x-api-key': 'imp-placeholder' },
      body: {
        model: 'model-a',
        tools: [{ name: 'mcp__nixie__note_read' }, { name: 'mcp__nixie__note_wait' }],
      },
    },
  ]);
});

test('it stops the turn with no model output when nixie tool server is not connected', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'The note says to buy milk.' });
  await runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:9', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
    {
      ...ctx.deps,

      // nothing listens on the discard port, so the server fails to connect
      toolServer: { type: 'http', url: 'http://127.0.0.1:9/mcp', alwaysLoad: true },
    },
  );

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'tools_not_connected', detail: "nixie's tool server is failed" },
  ]);
});

test('it reports each inbox message the model read, then the turn end at the last chain entry', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'You need milk.' },
  );
  await runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    },
    ctx.deps,
  );

  expect(ctx.frames).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    {
      type: 'assistant',
      messageID: expect.any(String),
      text: '',
      toolUses: [{ id: expect.any(String), name: 'mcp__nixie__note_read' }],
    },
    { type: 'assistant', messageID: expect.any(String), text: 'You need milk.', toolUses: [] },
    {
      type: 'ended',
      boundary: {
        sessionID: expect.any(String),
        messageID: Reflect.get(ctx.frames.at(2) ?? {}, 'messageID'),
      },
      subtype: 'success',
      stopReason: 'end_turn',
      turns: 2,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);
});

test('it passes a message into the running turn at the next tool boundary and reports it read', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  const turn = runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: null,
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Watch my note.' }],
    },
    { ...ctx.deps, messages: ctx.channel.readable },
  );

  await ctx.tools.waitForHeldCall();
  void ctx.channel.writable
    .getWriter()
    .write({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' });

  // a scenario offset: the CLI must queue the message while the call is held, and nothing in the
  // SDK reports the queueing to the test
  await Bun.sleep(500);
  ctx.tools.release();
  await turn;

  expect(ctx.frames.filter((frame) => frame.type === 'read')).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
  ]);
  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).toInclude('Also buy eggs.');
});

test('it resumes at a boundary on a new session that holds nothing after the boundary', async () => {
  const ctx = await setupTest();
  const runTurnAt = async (text: string, resume: GuestFrame | undefined) => {
    await runTurn(
      {
        type: 'turn',
        profile: {
          model: 'model-a',
          baseURL: ctx.model.url,
          effort: 'low',
          authHeader: 'x-api-key',
        },
        tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
        resume: resume?.type === 'ended' ? resume.boundary : null,
        systemPrompt: 'You are nixie.',
        input: [{ uuid: crypto.randomUUID(), text }],
      },
      { ...ctx.deps, toolServer: buildStubToolServer().config },
    );
    return ctx.frames.at(-1);
  };

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' }, { text: 'CHERRY' });

  const first = await runTurnAt('one', undefined);

  await runTurnAt('two', first);

  const rerun = await runTurnAt('three', first);

  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).toInclude('APPLE');
  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).not.toInclude('BANANA');
  expect(rerun).toMatchObject({ type: 'ended', subtype: 'success' });
  expect(rerun).not.toMatchObject({
    boundary: { sessionID: Reflect.get(Reflect.get(first ?? {}, 'boundary') ?? {}, 'sessionID') },
  });
});

test('it reports a session to resume that is not on the guest disk as missing', async () => {
  const ctx = await setupTest();

  await runTurn(
    {
      type: 'turn',
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
      tools: { url: 'http://127.0.0.1:8901', token: 'run-token' },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
      systemPrompt: 'You are nixie.',
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Hi.' }],
    },
    ctx.deps,
  );

  expect(ctx.frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'session_missing',
      detail: 'No conversation found with session ID: 7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
    },
  ]);
});
