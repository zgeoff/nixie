import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServerConfig, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { checkToolServer } from './check-tool-server';
import { buildStubToolServer } from './test-utils/build-stub-tool-server';
import { startStubHTTPToolServer } from './test-utils/start-stub-http-tool-server';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-tool-check-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  // a CLI session that never gets a message, so it never calls the model
  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the SDK's MCP config has no readonly form
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

    onTestFinished(() => {
      session.close();
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
});

test('it fails the turn with the CLI connection error when the reconnect fails too', async () => {
  const ctx = await setupTest();

  // nothing listens on the discard port
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
});

test('it lets the turn go on with no reconnect when the server connected at start', async () => {
  const ctx = await setupTest();
  const tools = await startStubHTTPToolServer();

  onTestFinished(() => tools.stop());

  const session = ctx.startSession(tools.config);
  const waitBeforeReconnect = mock(() => Promise.resolve());

  const result = await checkToolServer(session, waitBeforeReconnect);

  expect(result).toBeNull();
  expect(waitBeforeReconnect).not.toHaveBeenCalled();
});

test('it lets the turn go on when the CLI has not listed an in-process server yet', async () => {
  const ctx = await setupTest();

  const session = ctx.startSession(buildStubToolServer().config);

  const result = await checkToolServer(session, () => Promise.resolve());

  expect(result).toBeNull();
});

test('it lets the turn go on to read why when the CLI has ended', async () => {
  const ctx = await setupTest();

  const session = ctx.startSession(buildStubToolServer().config);

  session.close();

  const result = await checkToolServer(session, () => Promise.resolve());

  expect(result).toBeNull();
});
