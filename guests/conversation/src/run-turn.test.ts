import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { GuestFrame, InboxMessage, SessionPoint } from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { runTurn } from './run-turn';
import { buildQueryRecorder } from './test-utils/build-query-recorder';
import { buildStubToolServer } from './test-utils/build-stub-tool-server';
import { startStubChangingToolServer } from './test-utils/start-stub-changing-tool-server';
import { startStubModel } from './test-utils/start-stub-model';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-conversation-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const model = startStubModel();

  onTestFinished(() => model.stop());

  const frames: GuestFrame[] = [];
  const tools = buildStubToolServer();
  const recorder = buildQueryRecorder();

  return {
    home,
    model,
    tools,
    frames,
    recorder,

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
      runQuery: recorder.runQuery,

      // no pause before the one reconnect, so a turn on an unreachable server stops at once
      waitBeforeReconnect: () => Promise.resolve(),
    },
  };
}

test('it gives every query() nixie tools alone, no settings, skills or SDK memory, and no CLI compaction', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'You need milk.' },
  );

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url, cacheTTL: '1h' },
      systemPrompt: 'You are nixie.',
    }),
    ctx.deps,
  );

  expect(ctx.recorder.options).toStrictEqual([
    {
      tools: [],
      allowedTools: ['mcp__nixie'],
      thinking: { type: 'adaptive', display: 'summarized' },
      permissionMode: 'dontAsk',
      settingSources: [],
      strictMcpConfig: true,
      skills: [],
      verbatimPrompts: true,
      settings: {
        disableBundledSkills: true,
        autoMemoryEnabled: false,
        autoDreamEnabled: false,
        autoCompactEnabled: false,
        precomputeCompactionEnabled: false,
        idleCompaction: false,
        promptCacheTtl: '1h',
      },
      mcpServers: { nixie: ctx.tools.config },
      systemPrompt: { type: 'custom', prompt: 'You are nixie.', snapshot: false },
      cwd: join(ctx.home, 'conversation'),
      env: expect.toBeObject(),
    },
  ]);
});

test('it gives every query() the profile base URL, model and effort in its env', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello.' });

  await runTurn(
    buildMockTurnFrame({
      profile: { model: 'model-a', baseURL: ctx.model.url, effort: 'low', authHeader: 'x-api-key' },
    }),
    ctx.deps,
  );

  expect(ctx.recorder.options.map((options) => options.env)).toStrictEqual([
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
      DISABLE_COMPACT: '1',
      DISABLE_AUTOUPDATER: '1',
    },
  ]);
});

test('it offers the model nixie tools alone, on the profile model, with the placeholder credential', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello.' });

  await runTurn(
    buildMockTurnFrame({
      profile: { model: 'model-a', baseURL: ctx.model.url, authHeader: 'x-api-key' },
    }),
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

test('it sends a message of /clear to the model as text, never as a CLI command', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Nothing to clear here.' });

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: '/clear' }],
    }),
    ctx.deps,
  );

  const request = ctx.model.requests.findLast((candidate) => candidate.path === '/v1/messages');

  expect(request?.body?.messages).toPartiallyContain({ role: 'user', content: '/clear' });
});

test('it stops the turn with no model output when nixie tool server stays unreachable', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'The note says to buy milk.' });

  await runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
    ...ctx.deps,

    // nothing listens on the discard port, so the server fails to connect, and so does the retry
    toolServer: { type: 'http', url: 'http://127.0.0.1:9/mcp', alwaysLoad: true },
  });

  expect(ctx.frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'tools_not_connected',
      detail: expect.toStartWith("nixie's tool server is failed: ECONNREFUSED"),
    },
  ]);

  expect(ctx.model.requests).toStrictEqual([]);
});

test('it returns from a turn that ends at a result once the CLI process has exited', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'You need milk.' });

  await runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), ctx.deps);

  const pids = await readdir('/proc');

  const workDirs = await Promise.all(
    pids.map((pid) => readlink(join('/proc', pid, 'cwd')).catch(() => null)),
  );

  expect(workDirs).not.toContain(join(ctx.home, 'conversation'));
});

test('it returns from a turn that stops early once the CLI process has exited', async () => {
  const ctx = await setupTest();

  await runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
    ...ctx.deps,

    // nothing listens on the discard port, so the server fails to connect and the turn stops
    toolServer: { type: 'http', url: 'http://127.0.0.1:9/mcp', alwaysLoad: true },
  });

  const pids = await readdir('/proc');

  const workDirs = await Promise.all(
    pids.map((pid) => readlink(join('/proc', pid, 'cwd')).catch(() => null)),
  );

  expect(workDirs).not.toContain(join(ctx.home, 'conversation'));
});

test('it reports each inbox message the model read, then the turn end at the last chain entry', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } } },
    { text: 'You need milk.' },
  );

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    }),
    ctx.deps,
  );

  const reply = ctx.frames.at(2);

  if (reply?.type !== 'assistant') {
    throw new Error('the third frame is not an assistant frame');
  }

  expect(ctx.frames).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: '',
      toolUses: [{ id: expect.toBeString(), name: 'mcp__nixie__note_read' }],
    },
    { type: 'assistant', messageID: expect.toBeString(), text: 'You need milk.', toolUses: [] },
    {
      type: 'ended',
      boundary: { sessionID: expect.toBeString(), messageID: reply.messageID },
      subtype: 'success',
      stopReason: 'end_turn',
      isError: false,
      terminalReason: 'completed',
      turns: 2,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      context: { size: 10, window: 200_000 },
    },
  ]);
});

test('it reports the context of the last model call and the profile cap at the turn end', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } },
      inputTokens: 200,
      cacheReadTokens: 30_000,
      cacheWriteTokens: 4000,
    },
    { text: 'You need milk.', inputTokens: 300, cacheReadTokens: 38_000, cacheWriteTokens: 2700 },
  );

  await runTurn(
    buildMockTurnFrame({ profile: { baseURL: ctx.model.url, contextTokens: 400_000 } }),
    ctx.deps,
  );

  expect(ctx.frames.at(-1)).toMatchObject({
    type: 'ended',
    usage: { inputTokens: 500, cacheReadTokens: 68_000, cacheWriteTokens: 6700 },
    context: { size: 41_000, window: 400_000 },
  });
});

test('it carries the reasoning summary on the thinking frame, the thinking tokens on the turn end, and no signature on any frame', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({
    text: 'The 09:25 ferry reaches the north pier by 08:55.',
    thinking: {
      summary: 'I list the ferries, then take the earliest that reaches the pier by 08:55.',
      signature: 'c2lnbmF0dXJlLWJsb2I=',
      thinkingTokens: 236,
    },
  });

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Which ferry?' }],
    }),
    ctx.deps,
  );

  const reply = ctx.frames.at(2);

  if (reply?.type !== 'assistant') {
    throw new Error('the third frame is not an assistant frame');
  }

  expect(ctx.frames).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: '',
      toolUses: [],
      summary: 'I list the ferries, then take the earliest that reaches the pier by 08:55.',
    },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: 'The 09:25 ferry reaches the north pier by 08:55.',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: { sessionID: expect.toBeString(), messageID: reply.messageID },
      subtype: 'success',
      stopReason: 'end_turn',
      isError: false,
      terminalReason: 'completed',
      turns: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      thinkingTokens: 236,
      context: { size: 10, window: 200_000 },
    },
  ]);

  expect(JSON.stringify(ctx.frames)).not.toInclude('c2lnbmF0dXJlLWJsb2I');
});

test('it keeps a tool-call turn working under the summarized display, with a summary on each reply that thought', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__note_read', input: { name: 'groceries' } },
      thinking: { summary: 'I read the groceries note.', signature: 'c2ln', thinkingTokens: 12 },
    },
    {
      text: 'You need milk.',
      thinking: { summary: 'The note lists milk.', signature: 'c2ln', thinkingTokens: 34 },
    },
  );

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    }),
    ctx.deps,
  );

  const assistants = ctx.frames.filter((frame) => frame.type === 'assistant');

  expect(assistants).toStrictEqual([
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: '',
      toolUses: [],
      summary: 'I read the groceries note.',
    },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: '',
      toolUses: [{ id: expect.toBeString(), name: 'mcp__nixie__note_read' }],
    },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: '',
      toolUses: [],
      summary: 'The note lists milk.',
    },
    { type: 'assistant', messageID: expect.toBeString(), text: 'You need milk.', toolUses: [] },
  ]);

  const ended = ctx.frames.at(-1);

  if (ended?.type !== 'ended') {
    throw new Error('the turn did not end');
  }

  expect(ended.subtype).toBe('success');

  // the result reports the turn's thinking tokens once, as the total across both model calls
  expect(ended.thinkingTokens).toBe(46);
});

test('it keeps a resumed session working under the summarized display', async () => {
  const ctx = await setupTest();

  const runTurnAt = async (text: string, resume: SessionPoint | null) => {
    await runTurn(
      buildMockTurnFrame({
        profile: { baseURL: ctx.model.url },
        resume,
        input: [{ uuid: crypto.randomUUID(), text }],
      }),
      { ...ctx.deps, toolServer: buildStubToolServer().config },
    );

    const last = ctx.frames.at(-1);

    if (last?.type !== 'ended') {
      throw new Error('the turn did not end');
    }

    return last.boundary;
  };

  ctx.model.addReplies(
    { text: 'APPLE', thinking: { summary: 'I greet.', signature: 'c2ln', thinkingTokens: 5 } },
    {
      text: 'BANANA',
      thinking: { summary: 'I recall the apple.', signature: 'c2ln', thinkingTokens: 7 },
    },
  );

  const first = await runTurnAt('one', null);
  const rerun = await runTurnAt('two', first);

  const summaries = ctx.frames.flatMap((frame) =>
    frame.type === 'assistant' && frame.summary !== undefined ? [frame.summary] : [],
  );

  const messages = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  expect(summaries).toStrictEqual(['I greet.', 'I recall the apple.']);
  expect(messages).toInclude('APPLE');
  expect(rerun.sessionID).not.toBe(first.sessionID);
});

test('it marks the turn end as an error when the model API refuses the request', async () => {
  const ctx = await setupTest();

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    }),
    ctx.deps,
  );

  const reply = ctx.frames.at(1);

  if (reply?.type !== 'assistant') {
    throw new Error('the second frame is not an assistant frame');
  }

  expect(ctx.frames).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    {
      type: 'assistant',
      messageID: expect.toBeString(),
      text: 'API Error: 400 the stub model has no reply left',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: { sessionID: expect.toBeString(), messageID: reply.messageID },
      subtype: 'success',
      stopReason: 'stop_sequence',
      isError: true,
      terminalReason: 'api_error',
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);
});

test('it fails the turn with no assistant frame when the model API refuses the credential', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ authFailure: 'invalid x-api-key' });

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    }),
    ctx.deps,
  );

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'model_auth', detail: 'Invalid API key · Fix external API key' },
  ]);
});

test('it fails the turn with no assistant frame when the model API refuses an OAuth credential for its organization', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({
    authFailure: 'OAuth authentication is currently not allowed for this organization.',
  });

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'What do I need?' }],
    }),
    ctx.deps,
  );

  expect(ctx.frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'model_auth',
      detail:
        'Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access',
    },
  ]);
});

test('it ends the turn with the overflow reason when the model API refuses a prompt past its window', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ refusal: 'prompt is too long: 210000 tokens > 200000 maximum' });

  await runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), ctx.deps);

  expect(ctx.frames.at(-1)).toMatchObject({
    type: 'ended',
    subtype: 'success',
    isError: true,
    terminalReason: 'prompt_too_long',
  });
});

test('it ends an overflowed turn at its last chain entry before the overflow message', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'garden' } } },
    { refusal: 'prompt is too long: 210000 tokens > 200000 maximum' },
  );

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Read the garden note.' }],
    }),
    ctx.deps,
  );

  const ended = ctx.frames.at(-1);

  if (ended?.type !== 'ended') {
    throw new Error('the turn did not end');
  }

  const files = await readdir(join(ctx.home, '.claude', 'projects'), { recursive: true });

  const transcript = await Bun.file(
    join(
      ctx.home,
      '.claude',
      'projects',
      files.find((path) => path.endsWith(`${ended.boundary.sessionID}.jsonl`)) ?? '',
    ),
  ).text();

  expect(ended.terminalReason).toBe('prompt_too_long');

  // the CLI's transcript holds the overflow message after the tool result, and the boundary skips it
  expect(
    JSON.parse(
      transcript
        .split('\n')
        .find((line) => line.includes(`"uuid":"${ended.boundary.messageID}"`)) ?? 'null',
    ),
  ).toMatchObject({ type: 'user', message: { content: [{ type: 'tool_result' }] } });
});

test('it ends an overflowed turn at its resume point when the overflow is its first chain entry', async () => {
  const ctx = await setupTest();

  const runTurnAt = async (text: string, resume: SessionPoint | null) => {
    await runTurn(
      buildMockTurnFrame({
        profile: { baseURL: ctx.model.url },
        resume,
        input: [{ uuid: crypto.randomUUID(), text }],
      }),
      { ...ctx.deps, toolServer: buildStubToolServer().config },
    );

    const last = ctx.frames.at(-1);

    if (last?.type !== 'ended') {
      throw new Error('the turn did not end');
    }

    return last;
  };

  ctx.model.addReplies(
    { text: 'APPLE' },
    { refusal: 'prompt is too long: 210000 tokens > 200000 maximum' },
  );

  const first = await runTurnAt('one', null);
  const overflowed = await runTurnAt('two', first.boundary);

  expect(overflowed.terminalReason).toBe('prompt_too_long');
  expect(overflowed.boundary).toStrictEqual(first.boundary);
});

test('it passes a message into the running turn at the next tool boundary and reports it read', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  const turn = runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      input: [{ uuid: '6e697869-0000-8000-8000-000000000001', text: 'Watch my note.' }],
    }),
    { ...ctx.deps, messages: ctx.channel.readable },
  );

  onTestFinished(async () => {
    ctx.tools.release();

    await turn;
  });

  await ctx.tools.waitForHeldCall();

  await Promise.all([
    ctx.channel.writable
      .getWriter()
      .write({ uuid: '6e697869-0000-8000-8000-000000000002', text: 'Also buy eggs.' }),
    ctx.recorder.waitForQueued('6e697869-0000-8000-8000-000000000002'),
  ]);

  ctx.tools.release();

  await turn;

  expect(ctx.frames.filter((frame) => frame.type === 'read')).toStrictEqual([
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] },
    { type: 'read', uuids: ['6e697869-0000-8000-8000-000000000002'] },
  ]);

  expect(JSON.stringify(ctx.model.requests.at(-1)?.body?.messages)).toInclude('Also buy eggs.');
});

test('it fails the turn with the error its host message stream throws', async () => {
  const ctx = await setupTest();

  const writer = ctx.channel.writable.getWriter();

  ctx.model.addReplies({ text: 'Hello.' });
  void writer.abort(new Error('a turn is already running'));

  expect(
    runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
      ...ctx.deps,
      messages: ctx.channel.readable,
    }),
  ).rejects.toThrow('a turn is already running');
});

test('it fails the turn at once when the host message stream throws during a held tool call', async () => {
  const ctx = await setupTest();

  const writer = ctx.channel.writable.getWriter();

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  const turn = runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
    ...ctx.deps,
    messages: ctx.channel.readable,
  });

  onTestFinished(async () => {
    ctx.tools.release();

    await Promise.allSettled([turn]);
  });

  await ctx.tools.waitForHeldCall();

  void writer.abort(new Error('a turn is already running'));
  expect(turn).rejects.toThrow('a turn is already running');
});

test('it resumes at a boundary on a new session that holds nothing after the boundary', async () => {
  const ctx = await setupTest();

  const runTurnAt = async (text: string, resume: SessionPoint | null) => {
    await runTurn(
      buildMockTurnFrame({
        profile: { baseURL: ctx.model.url },
        resume,
        input: [{ uuid: crypto.randomUUID(), text }],
      }),
      { ...ctx.deps, toolServer: buildStubToolServer().config },
    );

    const last = ctx.frames.at(-1);

    if (last?.type !== 'ended') {
      throw new Error('the turn did not end');
    }

    return last.boundary;
  };

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' }, { text: 'CHERRY' });

  const first = await runTurnAt('one', null);

  await runTurnAt('two', first);

  const rerun = await runTurnAt('three', first);

  const messages = JSON.stringify(ctx.model.requests.at(-1)?.body?.messages);

  // toInclude fails on a missing request, so the negative check below reads a real one
  expect(messages).toInclude('APPLE');
  expect(messages).not.toInclude('BANANA');
  expect(rerun.sessionID).not.toBe(first.sessionID);
});

test('it sends the system prompt of each turn on a resumed session, not the one the session began with', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await runTurn(
    buildMockTurnFrame({ profile: { baseURL: ctx.model.url }, systemPrompt: 'You are nixie.' }),
    { ...ctx.deps, toolServer: buildStubToolServer().config },
  );

  const first = ctx.frames.at(-1);

  if (first?.type !== 'ended') {
    throw new Error('the first turn did not end');
  }

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      resume: first.boundary,
      systemPrompt: 'You are nixie. Pinned: the spare key sits under the blue flowerpot.',
    }),
    { ...ctx.deps, toolServer: buildStubToolServer().config },
  );

  const system = JSON.stringify(ctx.model.requests.at(-1)?.body?.system);

  expect(system).toInclude('Pinned: the spare key sits under the blue flowerpot.');
});

test('it offers the model the changed form of a tool on the next turn of a resumed session', async () => {
  const ctx = await setupTest();

  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
    ...ctx.deps,
    toolServer: tools.config,
  });

  const first = ctx.frames.at(-1);

  if (first?.type !== 'ended') {
    throw new Error('the first turn did not end');
  }

  tools.changeTool({
    description: 'Reads a note by its short ID.',
    inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
  });

  await runTurn(
    buildMockTurnFrame({ profile: { baseURL: ctx.model.url }, resume: first.boundary }),
    { ...ctx.deps, toolServer: tools.config },
  );

  const modelCalls = ctx.model.requests.filter((request) => request.path === '/v1/messages');

  expect(modelCalls).toHaveLength(2);

  expect(modelCalls[1]?.body?.tools).toContainEqual({
    name: 'mcp__nixie__note_read',
    description: 'Reads a note by its short ID.',
    input_schema: {
      type: 'object',
      properties: { noteID: { type: 'string' } },
      required: ['noteID'],
    },
  });
});

test('it offers the model the listed form of a tool at the next step of a turn when the server sends no notice', async () => {
  const ctx = await setupTest();

  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  const turn = runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
    ...ctx.deps,
    toolServer: tools.config,
  });

  await tools.waitForHeldCall();

  tools.changeTool({
    description: 'Reads a note by its short ID.',
    inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
  });

  tools.release();

  await turn;

  const modelCalls = ctx.model.requests.filter((request) => request.path === '/v1/messages');

  expect(modelCalls).toHaveLength(2);

  expect(modelCalls[1]?.body?.tools).toContainEqual({
    name: 'mcp__nixie__note_read',
    description: 'Reads a note by its name.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } } },
  });
});

test('it offers the model the changed form of a tool at the next step of a turn once the CLI lists the tools after a notice', async () => {
  const ctx = await setupTest();

  const tools = startStubChangingToolServer({
    description: 'Reads a note by its name.',
    inputSchema: { properties: { name: { type: 'string' } } },
  });

  onTestFinished(() => tools.stop());

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_wait', input: {} } },
    { text: 'Noted.' },
  );

  const turn = runTurn(buildMockTurnFrame({ profile: { baseURL: ctx.model.url } }), {
    ...ctx.deps,
    toolServer: tools.config,
  });

  await tools.waitForHeldCall();

  tools.changeTool({
    description: 'Reads a note by its short ID.',
    inputSchema: { properties: { noteID: { type: 'string' } }, required: ['noteID'] },
  });

  await tools.notifyToolsChanged();

  tools.release();

  await turn;

  const modelCalls = ctx.model.requests.filter((request) => request.path === '/v1/messages');

  expect(modelCalls).toHaveLength(2);

  expect(modelCalls[1]?.body?.tools).toContainEqual({
    name: 'mcp__nixie__note_read',
    description: 'Reads a note by its short ID.',
    input_schema: {
      type: 'object',
      properties: { noteID: { type: 'string' } },
      required: ['noteID'],
    },
  });
});

test('it never compacts the session itself when a call reads past the profile window', async () => {
  const ctx = await setupTest();

  const runTurnAt = async (text: string, resume: SessionPoint | null) => {
    await runTurn(
      buildMockTurnFrame({
        profile: { baseURL: ctx.model.url, contextTokens: 100_000 },
        resume,
        input: [{ uuid: crypto.randomUUID(), text }],
      }),
      { ...ctx.deps, toolServer: buildStubToolServer().config },
    );
  };

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__note_read', input: { name: 'a' } }, inputTokens: 150_000 },
    { text: 'CHERRY' },
  );

  await runTurnAt('three', null);

  expect(ctx.frames.filter((frame) => frame.type !== 'read')).toMatchObject([
    { type: 'assistant', text: '' },
    { type: 'assistant', text: 'CHERRY' },
    { type: 'ended', context: { window: 100_000 } },
  ]);
});

test('it reports a session to resume that is not on the guest disk as missing', async () => {
  const ctx = await setupTest();

  await runTurn(
    buildMockTurnFrame({
      profile: { baseURL: ctx.model.url },
      resume: {
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
      },
    }),
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

test('it keeps only the session it resumes and the fork it writes on the guest disk', async () => {
  const ctx = await setupTest();

  const runTurnAt = async (text: string, resume: SessionPoint | null) => {
    await runTurn(
      buildMockTurnFrame({
        profile: { baseURL: ctx.model.url },
        resume,
        input: [{ uuid: crypto.randomUUID(), text }],
      }),
      { ...ctx.deps, toolServer: buildStubToolServer().config },
    );

    const last = ctx.frames.at(-1);

    if (last?.type !== 'ended') {
      throw new Error('the turn did not end');
    }

    return last.boundary;
  };

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' }, { text: 'CHERRY' });

  const first = await runTurnAt('one', null);
  const second = await runTurnAt('two', first);
  const third = await runTurnAt('three', second);
  const files = await readdir(join(ctx.home, '.claude', 'projects'), { recursive: true });

  expect(
    files.filter((path) => path.endsWith('.jsonl')).map((path) => basename(path)),
  ).toIncludeSameMembers([`${second.sessionID}.jsonl`, `${third.sessionID}.jsonl`]);
});
