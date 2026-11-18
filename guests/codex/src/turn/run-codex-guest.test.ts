import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitForCondition } from '@heynixie/testing';
import type { GuestFrame, HostFrame } from '@heynixie/wire';
import {
  encodeFrame,
  encodeHostFrame,
  guestFrameSchema,
  harnessCapabilities,
  makeFrameDecoder,
} from '@heynixie/wire';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { z } from 'zod';
import { buildMockCodexTurnFrame } from '../test-utils/build-mock-codex-turn-frame';
import { buildMockTokenBreakdown } from '../test-utils/build-mock-token-breakdown';
import { makeTurnAnswer } from '../test-utils/make-turn-answer';
import type { FakeAppServer } from '../test-utils/start-fake-app-server';
import { startFakeAppServer } from '../test-utils/start-fake-app-server';
import { runCodexGuest } from './run-codex-guest';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-codex-guest-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const input = new TransformStream<Uint8Array, Uint8Array>();

  const inputWriter = input.writable.getWriter();
  const frames: GuestFrame[] = [];
  const decode = makeFrameDecoder(1 << 24);

  return {
    home,
    frames,
    sendFrame: (frame: HostFrame) =>
      inputWriter.write(encodeFrame(encodeHostFrame(harnessCapabilities['agent-sdk'], frame))),
    endInput: () => inputWriter.close(),
    runGuest: (server: FakeAppServer | null, version = 'codex-cli 0.166.0') =>
      runCodexGuest({
        input: input.readable,
        write: (bytes) => {
          for (const message of decode(bytes)) {
            const text = new TextDecoder().decode(message);

            const frame: unknown = JSON.parse(text);

            frames.push(guestFrameSchema.parse(frame));
          }

          return Promise.resolve();
        },
        env: { HOME: home, PATH: '/usr/bin', OPENAI_API_KEY: 'nixie-broker-placeholder' },
        readVersion: () => Promise.resolve(version),
        startProcess: () => {
          if (server === null) {
            throw new Error('the guest started the CLI');
          }

          return server.process;
        },
      }),
  };
}

test('it starts a thread with the model, the working directory and the system prompt, then the turn', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => server.requests.length === 2);

  await ctx.endInput();

  server.close(0);

  await running;

  expect(server.requests).toStrictEqual([
    {
      method: 'thread/start',
      params: {
        model: 'gpt-test-1',
        cwd: join(ctx.home, 'codex-work'),
        baseInstructions: 'You are nixie.',
      },
    },
    {
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [{ type: 'text', text: 'Hi.', text_elements: [] }],
      },
    },
  ]);
});

test('it writes the turn frame tool-call wait into the tool server config in seconds', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(
    buildMockCodexTurnFrame({ limits: { modelCalls: null, toolCallWaitMs: 2000 } }),
  );

  await waitForCondition(() => server.requests.length === 2);

  await ctx.endInput();

  server.close(0);

  await running;

  const config = await readFile(join(ctx.home, '.codex', 'config.toml'), 'utf8');

  expect(config.split('\n')).toContain('tool_timeout_sec = 2');
});

test('it sends one read frame of every input message when the turn starts', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(
    buildMockCodexTurnFrame({
      input: [
        { uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', text: 'One.' },
        { uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d004', text: 'Two.' },
      ],
    }),
  );

  await waitForCondition(() => ctx.frames.length === 1);

  await ctx.endInput();

  server.close(0);

  await running;

  expect(ctx.frames[0]).toStrictEqual({
    type: 'read',
    uuids: ['7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003', '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d004'],
  });
});

test('it writes an input image to the working directory and sends a localImage item in place of its marker', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(
    buildMockCodexTurnFrame({
      input: [
        {
          uuid: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d003',
          text: 'Look at [image 1] please.',
          images: [{ marker: '[image 1]', mediaType: 'image/png', data: btoa('png-bytes') }],
        },
      ],
    }),
  );

  await waitForCondition(() => server.requests.length === 2);

  await ctx.endInput();

  server.close(0);

  await running;

  expect([
    server.requests[1],
    await readFile(join(ctx.home, 'codex-work', 'image-1.png'), 'utf8'),
  ]).toStrictEqual([
    {
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        input: [
          { type: 'text', text: 'Look at ', text_elements: [] },
          { type: 'localImage', path: join(ctx.home, 'codex-work', 'image-1.png') },
          { type: 'text', text: ' please.', text_elements: [] },
        ],
      },
    },
    'png-bytes',
  ]);
});

test('it sends an assistant frame for each completed agent message of its own turn', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'item/completed',
        params: {
          turnId: 'other-turn',
          item: { type: 'agentMessage', id: 'x', text: 'Not mine.' },
        },
      },
      {
        method: 'item/completed',
        params: { turnId: 'turn-1', item: { type: 'mcpToolCall', id: 'call-1' } },
      },
      {
        method: 'item/completed',
        params: { turnId: 'turn-1', item: { type: 'agentMessage', id: 'msg-1', text: 'Hello.' } },
      },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => ctx.frames.some((frame) => frame.type === 'assistant'));

  await ctx.endInput();

  server.close(0);

  await running;

  expect(ctx.frames.filter((frame) => frame.type === 'assistant')).toStrictEqual([
    { type: 'assistant', messageID: 'msg-1', text: 'Hello.', toolUses: [] },
  ]);
});

test('it sends a call frame for an update whose total grew by its last figure, and none for a repeated figure', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'turn-1',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 40,
              cacheWriteInputTokens: 10,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 40,
              cacheWriteInputTokens: 10,
            }),
          },
        },
      },
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'turn-1',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 40,
              cacheWriteInputTokens: 10,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 40,
              cacheWriteInputTokens: 10,
            }),
          },
        },
      },
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'other-turn',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 220,
              inputTokens: 200,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
            }),
          },
        },
      },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => ctx.frames.some((frame) => frame.type === 'call'));

  server.notify('turn/completed', { turn: { id: 'turn-1', status: 'completed' } });

  await running;

  expect(ctx.frames.filter((frame) => frame.type === 'call')).toStrictEqual([
    {
      type: 'call',
      usage: {
        uncachedInputTokens: 50,
        cacheReadTokens: 40,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 10,
        outputTokens: 10,
        reasoningTokens: 1,
      },
    },
  ]);
});

test('it ends a completed turn as finished with the usage of its calls', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'turn-1',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 40,
              cacheWriteInputTokens: 10,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 40,
              cacheWriteInputTokens: 10,
            }),
          },
        },
      },
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'turn-1',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 240,
              inputTokens: 220,
              cachedInputTokens: 90,
              cacheWriteInputTokens: 0,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 130,
              inputTokens: 120,
              cachedInputTokens: 50,
              cacheWriteInputTokens: 0,
            }),
          },
        },
      },
      { method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await running;

  expect(ctx.frames.at(-1)).toStrictEqual({
    type: 'ended',
    outcome: 'finished',
    stopReason: null,
    turns: 2,
    usage: { inputTokens: 120, outputTokens: 20, cacheReadTokens: 90, cacheWriteTokens: 10 },
    thinkingTokens: 2,
  });
});

test('it interrupts the turn at the model-call limit and ends it as limit', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'turn-1',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
            }),
          },
        },
      },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame({ limits: { modelCalls: 1, toolCallWaitMs: null } }));

  await waitForCondition(() =>
    server.requests.some((request) => request.method === 'turn/interrupt'),
  );

  server.notify('turn/completed', { turn: { id: 'turn-1', status: 'interrupted' } });

  await running;

  expect([server.requests.at(-1), ctx.frames.at(-1)]).toStrictEqual([
    { method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } },
    expect.objectContaining({ type: 'ended', outcome: 'limit', turns: 1 }),
  ]);
});

test('it ends a turn as finished when the model finishes after its own limit interrupt', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'thread/tokenUsage/updated',
        params: {
          turnId: 'turn-1',
          tokenUsage: {
            total: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
            }),
            last: buildMockTokenBreakdown({
              totalTokens: 110,
              inputTokens: 100,
              cachedInputTokens: 0,
              cacheWriteInputTokens: 0,
            }),
          },
        },
      },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame({ limits: { modelCalls: 1, toolCallWaitMs: null } }));

  await waitForCondition(() =>
    server.requests.some((request) => request.method === 'turn/interrupt'),
  );

  server.notify('turn/completed', { turn: { id: 'turn-1', status: 'completed' } });

  await running;

  expect(ctx.frames.at(-1)).toStrictEqual(
    expect.objectContaining({ type: 'ended', outcome: 'finished' }),
  );
});

test('it interrupts the turn on an interrupt frame and ends it as interrupted', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => ctx.frames.length === 1);

  await ctx.sendFrame({ type: 'interrupt' });

  await waitForCondition(() =>
    server.requests.some((request) => request.method === 'turn/interrupt'),
  );

  server.notify('turn/completed', { turn: { id: 'turn-1', status: 'interrupted' } });

  await running;

  expect([server.requests.at(-1), ctx.frames.at(-1)]).toStrictEqual([
    { method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } },
    expect.objectContaining({ type: 'ended', outcome: 'interrupted' }),
  ]);
});

test.each([
  {
    title: 'a 401 from the model API',
    info: { httpConnectionFailed: { httpStatusCode: 401 } },
    expected: { reason: 'model_auth' },
  },
  {
    title: 'an unauthorized error',
    info: 'unauthorized',
    expected: { reason: 'model_auth' },
  },
  {
    title: 'a 429 from the model API',
    info: { responseTooManyFailedAttempts: { httpStatusCode: 429 } },
    expected: { reason: 'model_api', error: 'rate_limit' },
  },
  {
    title: 'a 503 from the model API',
    info: { httpConnectionFailed: { httpStatusCode: 503 } },
    expected: { reason: 'model_api', error: 'server_error' },
  },
  {
    title: 'a 404 from the model API',
    info: { httpConnectionFailed: { httpStatusCode: 404 } },
    expected: { reason: 'model_api', error: 'model_not_found' },
  },
  {
    title: 'a 400 from the model API',
    info: { httpConnectionFailed: { httpStatusCode: 400 } },
    expected: { reason: 'model_api', error: 'unknown' },
  },
  {
    title: 'an internal server error with no status',
    info: 'internalServerError',
    expected: { reason: 'model_api', error: 'server_error' },
  },
  {
    title: 'a context overflow',
    info: 'contextWindowExceeded',
    expected: { reason: 'error' },
  },
])('it sends a failed frame with $expected for $title', async (row) => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'turn/completed',
        params: {
          turn: {
            id: 'turn-1',
            status: 'failed',
            error: { message: 'It failed.', codexErrorInfo: row.info, additionalDetails: null },
          },
        },
      },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await running;

  expect(ctx.frames.at(-1)).toStrictEqual({
    type: 'failed',
    ...row.expected,
    detail: 'It failed.',
  });
});

test('it fails the turn on an error notification that will not retry, and not on one that will', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(
    makeTurnAnswer([
      {
        method: 'error',
        params: {
          turnId: 'turn-1',
          willRetry: true,
          error: { message: 'Reconnecting... 1/5', codexErrorInfo: 'other' },
        },
      },
      {
        method: 'error',
        params: {
          turnId: 'turn-1',
          willRetry: false,
          error: {
            message: 'No more.',
            codexErrorInfo: { httpConnectionFailed: { httpStatusCode: 401 } },
          },
        },
      },
    ]),
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await running;

  expect(ctx.frames.filter((frame) => frame.type === 'failed')).toStrictEqual([
    { type: 'failed', reason: 'model_auth', detail: 'No more.' },
  ]);
});

test('it fails with tools_not_connected when the CLI cannot start the required tool server', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer((request) =>
    request.method === 'thread/start'
      ? {
          error:
            'error creating thread: Failed to initialize session: required MCP servers failed to initialize: nixie: handshaking failed',
        }
      : {},
  );

  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await running;

  expect(ctx.frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'tools_not_connected',
      detail: expect.stringContaining('required MCP servers failed to initialize'),
    },
  ]);
});

test('it fails with error on any other refusal to start the thread', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(() => ({ error: 'no such model' }));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await running;

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.stringContaining('no such model') },
  ]);
});

test('it fails with error when the stream closes before the turn ends', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => ctx.frames.length === 1);

  server.close(1);

  await running;

  expect(ctx.frames.at(-1)).toStrictEqual({
    type: 'failed',
    reason: 'error',
    detail: 'codex app-server exited with status 1',
  });
});

test('it fails with error and starts no CLI when the image holds another version', async () => {
  const ctx = await setupTest();

  const running = ctx.runGuest(null, 'codex-cli 0.165.0');

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await running;

  expect(ctx.frames).toStrictEqual([
    {
      type: 'failed',
      reason: 'error',
      detail: 'the codex guest runs 0.166.0, and the image holds "codex-cli 0.165.0"',
    },
  ]);
});

test('it fails with error on a turn frame whose profile names another harness', async () => {
  const ctx = await setupTest();

  const running = ctx.runGuest(null);

  await ctx.sendFrame(buildMockTurnFrame());

  await running;

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.stringContaining('agent-sdk') },
  ]);
});

test('it fails with error when the first frame is neither a turn nor a purge', async () => {
  const ctx = await setupTest();

  const running = ctx.runGuest(null);

  await ctx.sendFrame({ type: 'interrupt' });

  await running;

  expect(ctx.frames).toStrictEqual([
    { type: 'failed', reason: 'error', detail: expect.stringContaining('interrupt') },
  ]);
});

test('it removes the session state and sends purged on a purge frame', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.home, '.codex', 'sessions'), { recursive: true });
  await mkdir(join(ctx.home, 'codex-work'), { recursive: true });
  await writeFile(join(ctx.home, '.codex', 'sessions', 'rollout.jsonl'), 'forgotten text');
  await writeFile(join(ctx.home, 'codex-work', 'image-1.png'), 'forgotten image');

  const running = ctx.runGuest(null);

  await ctx.sendFrame({ type: 'purge' });

  await running;

  expect([ctx.frames, await readdir(ctx.home)]).toStrictEqual([[{ type: 'purged' }], []]);
});

test('it logs in with a placeholder token before its first thread when the profile has a plan login', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);
  const sentAtMs = Date.now();

  await ctx.sendFrame(
    buildMockCodexTurnFrame({ chatgptLogin: { accountID: 'acct-test-1', planType: 'plus' } }),
  );

  await waitForCondition(() => server.requests.length === 3);

  await ctx.endInput();

  server.close(0);

  await running;

  const [login] = server.requests;
  const sent = z.object({ accessToken: z.string() }).parse(login?.params);

  const claims = JSON.parse(
    Buffer.from(sent.accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  );

  expect(server.requests.map((request) => request.method)).toStrictEqual([
    'account/login/start',
    'thread/start',
    'turn/start',
  ]);

  expect(login?.params).toStrictEqual({
    type: 'chatgptAuthTokens',
    accessToken: expect.toBeString(),
    chatgptAccountId: 'acct-test-1',
    chatgptPlanType: 'plus',
  });

  expect(claims).toStrictEqual({
    'https://api.openai.com/auth': { chatgpt_account_id: 'acct-test-1', chatgpt_plan_type: 'plus' },
    exp: expect.toBeWithin(sentAtMs / 1000 + 86_399, sentAtMs / 1000 + 86_402),
  });
});

test('it answers a token refresh at once with a new placeholder in the same 3 fields', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(
    buildMockCodexTurnFrame({ chatgptLogin: { accountID: 'acct-test-1', planType: 'plus' } }),
  );

  await waitForCondition(() => server.requests.length === 3);

  const answer = await server.request('account/chatgptAuthTokens/refresh', {
    reason: 'unauthorized',
    previousAccountId: 'acct-test-1',
  });

  await ctx.endInput();

  server.close(0);

  await running;

  expect(answer).toStrictEqual({
    accessToken: expect.toBeString(),
    chatgptAccountId: 'acct-test-1',
    chatgptPlanType: 'plus',
  });
});

test('it answers a token refresh with an error on an API key profile', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => server.requests.length === 2);

  const answer = await server.request('account/chatgptAuthTokens/refresh', {});

  await ctx.endInput();

  server.close(0);

  await running;

  expect(answer).toMatchObject({ error: { code: -32_601 } });
});

test('it sends no account login on an API key profile, and writes the API key config', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(buildMockCodexTurnFrame());

  await waitForCondition(() => server.requests.length === 2);

  await ctx.endInput();

  server.close(0);

  await running;

  const config = await readFile(join(ctx.home, '.codex', 'config.toml'), 'utf8');

  expect(server.requests.map((request) => request.method)).toStrictEqual([
    'thread/start',
    'turn/start',
  ]);

  expect(config.split('\n')).toContain('env_key = "OPENAI_API_KEY"');
});

test('it writes no auth file into the codex home on a plan login', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(
    buildMockCodexTurnFrame({ chatgptLogin: { accountID: 'acct-test-1', planType: 'plus' } }),
  );

  await waitForCondition(() => server.requests.length === 3);

  await ctx.endInput();

  server.close(0);

  await running;

  const files = await readdir(join(ctx.home, '.codex'));

  expect(files.toSorted()).toStrictEqual(['config.toml', 'model-catalog.json']);
});

test('it sends no service tier in any request of a plan login turn', async () => {
  const ctx = await setupTest();

  const server = startFakeAppServer(makeTurnAnswer(undefined));
  const running = ctx.runGuest(server);

  await ctx.sendFrame(
    buildMockCodexTurnFrame({ chatgptLogin: { accountID: 'acct-test-1', planType: 'plus' } }),
  );

  await waitForCondition(() => server.requests.length === 3);

  await ctx.endInput();

  server.close(0);

  await running;

  expect(JSON.stringify(server.requests)).not.toMatch(/service_?tier/iu);
});
