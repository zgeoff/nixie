// One worker turn: a single query() with every built-in tool off, run unchanged on host and in imp.
// It prints one JSON line per milestone as it happens. Env: NIXIE_PLACEMENT (host or imp),
// NIXIE_TOOLS (0, 1 or 3), NIXIE_MCP_URL, NIXIE_MCP_TOKEN, NIXIE_MODEL, CLAUDE_CODE_OAUTH_TOKEN.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

function readEnv(name: string): string {
  return process.env[name] ?? '';
}

function emit(event: string, fields: Record<string, unknown> = {}): void {
  const ms = Math.round(performance.now() - started);
  console.log(JSON.stringify({ event, ms, ...fields }));
}

// The broker's variables pass through by name, because options.env replaces the CLI's whole env.
function collectBrokerEnv(mcpUrl: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of brokerVariables) {
    if (process.env[name]) {
      env[name] = readEnv(name);
    }
  }

  // Claude Code sends a plain http:// MCP request through HTTPS_PROXY, and the broker serves only
  // CONNECT, so the tool endpoint's host goes on NO_PROXY.
  if (mcpUrl) {
    env.NO_PROXY = [readEnv('NO_PROXY'), new URL(mcpUrl).hostname].filter(Boolean).join(',');
    env.no_proxy = env.NO_PROXY;
  }
  return env;
}

function buildEnv(placement: string, mcpUrl: string): Record<string, string> {
  const base = {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    HOME: readEnv('HOME'),
    PATH: readEnv('PATH'),
  };
  if (placement === 'host') {
    return { ...base, CLAUDE_CODE_OAUTH_TOKEN: readEnv('CLAUDE_CODE_OAUTH_TOKEN') };
  }

  // The broker drops the guest's Authorization header and sets the real token.
  return {
    ...base,
    ...collectBrokerEnv(mcpUrl),
    CLAUDE_CODE_OAUTH_TOKEN: 'imp-broker-placeholder',
  };
}

function readTools(): number {
  return Number(readEnv('NIXIE_TOOLS') || '0');
}

function buildServers(tools: number, mcpUrl: string): Record<string, McpServerConfig> {
  if (tools === 0) {
    return {};
  }
  return {
    nixie: {
      alwaysLoad: true,
      headers: { Authorization: `Bearer ${readEnv('NIXIE_MCP_TOKEN')}` },
      type: 'http',
      url: `${mcpUrl}/${tools}`,
    },
  };
}

const brokerVariables = [
    'HTTPS_PROXY',
    'https_proxy',
    'NO_PROXY',
    'no_proxy',
    'NODE_USE_ENV_PROXY',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
  ],
  mcpUrl = readTools() > 0 ? readEnv('NIXIE_MCP_URL') : '',
  options: Options = {
    allowedTools: [],

    // A neutral working directory: the CLI's system prompt carries it even with no built-in tools.
    cwd: mkdtempSync(join(tmpdir(), 'nixie-turn-')),
    env: buildEnv(readEnv('NIXIE_PLACEMENT'), mcpUrl),
    includePartialMessages: true,
    maxTurns: 1,
    mcpServers: buildServers(readTools(), mcpUrl),
    model: readEnv('NIXIE_MODEL') || 'claude-haiku-5-5',
    permissionMode: 'default',
    settingSources: [],
    strictMcpConfig: true,
    tools: [],
  },
  prompt = 'Reply with one short sentence that says you are ready. Do not call any tool.',
  started = performance.now();

let sawText = false;

// performance.now() counts from process start, so processStartMs is the module load time.
emit('query', { processStartMs: Math.round(started) });
for await (const message of query({ options, prompt })) {
  if (message.type === 'system' && message.subtype === 'init') {
    emit('init', {
      cli: message.claude_code_version,
      mcp: message.mcp_servers.map((server) => server.status),
      model: message.model,
      tools: message.tools.length,
    });
  } else if (
    !sawText &&
    message.type === 'stream_event' &&
    message.event.type === 'content_block_delta' &&
    message.event.delta.type === 'text_delta'
  ) {
    sawText = true;
    emit('first_text');
  } else if (message.type === 'result') {
    emit('result', {
      apiMs: message.duration_api_ms,
      isError: message.is_error,
      subtype: message.subtype,
      turns: message.num_turns,
    });
  }
}
