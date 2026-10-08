// oxlint-disable one-var, sort-vars, max-statements, no-await-in-loop, unicorn/prefer-add-event-listener -- spike code: runs happen one after another, and the transport tap must replace the MCP SDK on-handlers
// Runs the Agent SDK with every built-in tool off against a local Messages API mock, with nixie's
// tools served in-process, over HTTP from a v1 server and over HTTP from a v2 server, and records what reaches the model and the MCP server.
// No real credential: the SDK gets a dummy API key and a fresh HOME, and nothing else from the env.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServerConfig, Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { mcpLog, startHttpEndpoint, startHttpEndpointV2 } from './endpoints.ts';
import type { MockRequest } from './mock.ts';
import { startMock } from './mock.ts';
import { registerTools } from './tools.ts';

interface Case {
  input: Record<string, unknown>;
  tool: string;
}

const resultsDir = join(import.meta.dir, 'results'),
  cases: Case[] = [
    { input: { url: 'https://shop.example/item' }, tool: 'price_text' },
    { input: { url: 'https://shop.example/item' }, tool: 'price_bare' },
    { input: { to: 'someone@example.com' }, tool: 'always_fails' },
  ],
  leakMarkers = [
    'nixie/effects',
    'readOnlyHint',
    'Look up a price',
    'ISO 4217',
    'price-text-block',
  ],
  toolNames = ['price_text', 'price_bare', 'always_fails'].map((name) => `mcp__nixie__${name}`);

function write(name: string, data: unknown): void {
  writeFileSync(join(resultsDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

// Logs every JSON-RPC message that passes a transport, both ways.
function setupTap(transport: Transport, via: string): void {
  const send = transport.send.bind(transport),
    received = transport.onmessage;
  transport.onmessage = (message, extra) => {
    mcpLog.push({ direction: 'in', message, via });
    received?.(message, extra);
  };
  transport.send = async (message, options) => {
    mcpLog.push({ direction: 'out', message, via });
    await send(message, options);
  };
}

function buildInProcess(): McpServerConfig {
  const config = createSdkMcpServer({ alwaysLoad: true, name: 'nixie', version: '0.0.0' }),
    instance = config.instance,
    connect = instance.connect.bind(instance);
  registerTools(instance);
  instance.connect = async (transport: Transport) => {
    await connect(transport);
    setupTap(transport, 'in-process');
  };
  return config;
}

function buildOptions(mockUrl: string, servers: Record<string, McpServerConfig>): Options {
  const home = mkdtempSync(join(tmpdir(), 'nixie-spike-home-'));
  return {
    allowedTools: toolNames,
    cwd: mkdtempSync(join(tmpdir(), 'nixie-spike-cwd-')),
    env: {
      ANTHROPIC_API_KEY: 'sk-mock-not-a-key',
      ANTHROPIC_BASE_URL: mockUrl,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      HOME: home,
      NO_PROXY: '127.0.0.1,localhost',
      PATH: process.env.PATH ?? '',
    },
    maxTurns: 3,
    mcpServers: servers,
    model: 'claude-haiku-4-5',
    permissionMode: 'default',
    settingSources: [],
    strictMcpConfig: true,
    tools: [],
  };
}

async function runOnce(
  label: string,
  options: Options,
): Promise<{ init: unknown; result: unknown; toolUseResult: unknown[] }> {
  const summary = {
    init: undefined as unknown,
    result: undefined as unknown,
    toolUseResult: [] as unknown[],
  };
  for await (const message of query({
    options,
    prompt: 'Call the tool once, then stop.',
  }) as AsyncIterable<SDKMessage>) {
    if (message.type === 'system' && message.subtype === 'init') {
      summary.init = { mcp_servers: message.mcp_servers, tools: message.tools };
    }
    if (message.type === 'user' && 'tool_use_result' in message) {
      summary.toolUseResult.push(message.tool_use_result);
    }
    if (message.type === 'result') {
      summary.result = {
        is_error: message.is_error,
        num_turns: message.num_turns,
        subtype: message.subtype,
      };
    }
  }
  console.log(`== ${label}: ${JSON.stringify(summary.init)}`);
  return summary;
}

function collectRequests(requests: MockRequest[]): unknown[] {
  return requests.map((request) => {
    const body = request.body ?? {},
      messages = (body.messages ?? []) as { content: unknown; role: string }[],
      tools = (body.tools ?? []) as Record<string, unknown>[],
      text = JSON.stringify(body);
    return {
      // Markers that appear only in nixie metadata, annotations, the output schema or the text block.
      bodyHolds: Object.fromEntries(leakMarkers.map((marker) => [marker, text.includes(marker)])),
      lastMessage: messages.at(-1),
      method: request.method,
      path: request.path,
      stream: body.stream,
      tools,
    };
  });
}

// Asks the in-process server for a revision it may not know, to see which one it answers with.
async function checkInProcessRevision(): Promise<unknown> {
  const config = createSdkMcpServer({ name: 'probe', version: '0.0.0' }),
    [client, server] = InMemoryTransport.createLinkedPair(),
    answers: unknown[] = [];
  registerTools(config.instance);
  await config.instance.connect(server);
  client.onmessage = (message) => {
    answers.push(message);
  };
  await client.start();
  for (const [id, version] of [
    [1, '2026-07-28'],
    [2, '2025-11-25'],
  ] as const) {
    await client.send({
      id,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'probe', version: '0' },
        protocolVersion: version,
      },
    });
  }
  await Bun.sleep(100);
  await client.close();
  return answers;
}

async function runSpike(): Promise<void> {
  rmSync(resultsDir, { force: true, recursive: true });
  mkdirSync(resultsDir);
  const mock = startMock(),
    http = startHttpEndpoint(),
    httpV2 = startHttpEndpointV2(),
    placements: [string, () => Record<string, McpServerConfig>][] = [
      ['in-process', () => ({ nixie: buildInProcess() })],
      ['http', () => ({ nixie: { alwaysLoad: true, type: 'http', url: http.url } })],
      ['http-v2', () => ({ nixie: { alwaysLoad: true, type: 'http', url: httpV2.url } })],
    ];
  try {
    for (const [placement, servers] of placements) {
      for (const testCase of cases) {
        const label = `${placement} ${testCase.tool}`,
          from = mock.requests.length;
        mock.setTarget(testCase.tool, testCase.input);
        const summary = await runOnce(label, buildOptions(mock.url, servers()));
        write(`${placement}-${testCase.tool}.json`, {
          ...summary,
          requests: collectRequests(mock.requests.slice(from)),
        });
      }
    }
    const from = mock.requests.length;
    mock.setTarget('price_text', {});
    const unreachable = await runOnce(
      'http unreachable',
      buildOptions(mock.url, {
        nixie: { alwaysLoad: true, type: 'http', url: 'http://127.0.0.1:9/mcp' },
      }),
    );
    write('http-unreachable.json', {
      ...unreachable,
      requests: collectRequests(mock.requests.slice(from)),
    });
    write('mcp-log.json', mcpLog);
    const probe = await checkInProcessRevision();
    write('in-process-probe.json', probe);
  } finally {
    http.stop();
    httpV2.stop();
    mock.stop();
  }
}

await runSpike();
