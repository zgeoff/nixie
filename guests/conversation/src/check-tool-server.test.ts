import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServerConfig, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { checkToolServer } from './check-tool-server';
import { createStubToolServer } from './test-utils/create-stub-tool-server';
import { startStubHTTPToolServer } from './test-utils/start-stub-http-tool-server';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const home = await mkdtemp(join(tmpdir(), 'nixie-tool-check-'));

  stack.defer(() => rm(home, { recursive: true, force: true }));

  const startSession = (toolServer: McpServerConfig) => {
    const session = query({
      prompt: new TransformStream<SDKUserMessage, SDKUserMessage>().readable,
      options: {
        tools: [],
        settingSources: [],
        strictMcpConfig: true,
        mcpServers: { nixie: toolServer },
        cwd: home,
        env: {
          PATH: process.env['PATH'] ?? '',
          HOME: home,
          CLAUDE_CONFIG_DIR: join(home, '.claude'),
          ANTHROPIC_API_KEY: 'imp-placeholder',
        },
      },
    });

    // close() returns before the CLI exits, and the CLI writes to its home on the way out, so the
    // home is removed only once return() has awaited the exit.
    stack.defer(async () => {
      await session.return();
    });

    return session;
  };

  return { startSession };
}

test('it reconnects once to a server whose first connection the route reset, and lets the turn go on', async () => {
  const ctx = await setupTest();
  const tools = await startStubHTTPToolServer();

  onTestFinished(() => tools.stop());

  tools.dropConnections();

  const session = ctx.startSession(tools.config);
  const waitBeforeReconnect = mock(tools.acceptConnections);

  const result = await checkToolServer(session, waitBeforeReconnect);

  expect(result).toBeNull();
  expect(waitBeforeReconnect).toHaveBeenCalledOnce();
  expect(tools.resets()).toBeGreaterThanOrEqual(1);
}, 30_000);

test('it fails the turn with the CLI connection error when the reconnect fails too', async () => {
  const ctx = await setupTest();

  const session = ctx.startSession({
    type: 'http',
    url: 'http://127.0.0.1:9/mcp',
    alwaysLoad: true,
  });

  const result = await checkToolServer(session, () => Promise.resolve());

  expect(result).toStrictEqual({
    type: 'failed',
    reason: 'tools_not_connected',
    detail: expect.toStartWith("nixie's tool server is failed: ECONNREFUSED"),
  });
}, 30_000);

test('it lets the turn go on with no reconnect when the server connected at start', async () => {
  const ctx = await setupTest();
  const tools = await startStubHTTPToolServer();

  onTestFinished(() => tools.stop());

  const session = ctx.startSession(tools.config);
  const waitBeforeReconnect = mock(() => Promise.resolve());

  const result = await checkToolServer(session, waitBeforeReconnect);

  expect(result).toBeNull();
  expect(waitBeforeReconnect).not.toHaveBeenCalled();
}, 30_000);

test('it lets the turn go on when the CLI has not listed an in-process server yet', async () => {
  const ctx = await setupTest();

  const session = ctx.startSession(createStubToolServer().config);

  const result = await checkToolServer(session, () => Promise.resolve());

  expect(result).toBeNull();
}, 30_000);

test('it lets the turn go on to read why when the CLI has ended', async () => {
  const ctx = await setupTest();

  const session = ctx.startSession(createStubToolServer().config);

  session.close();

  const result = await checkToolServer(session, () => Promise.resolve());

  expect(result).toBeNull();
}, 30_000);
