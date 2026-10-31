// One long turn inside the imp, with nixie's options: every built-in tool off and nixie's tools over
// HTTP MCP. It prints one JSON line per event as it happens, and the host stamps each line on
// arrival. Usage: bun turn.ts rotation|parallel. Env: SPIKE_TOOLS_URL, SPIKE_TOOLS_TOKEN,
// NIXIE_MODEL, and the broker's variables that impz exec --require broker sets.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';

const prompts = {
  rotation: [
    'This is a test of a long task. Call the wait tool 8 times, one call at a time.',
    'Pass step 1 to 8 in order and seconds 4 each time, and wait for each result before the next call.',
    'Never call it twice in one message. After the 8th result, reply with one line that lists the 8 results.',
  ].join(' '),
  parallel: [
    'This is a test of parallel tool calls.',
    'First, in a single message, call wait_read_only 3 times at once, with labels a, b and c and seconds 3.',
    'Then, in a single message, call wait 3 times at once, with labels d, e and f and seconds 3.',
    'Then reply with one line that lists the 6 results.',
  ].join(' '),
} as const;

const brokerVariables = [
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
];
const scenario = readScenario(process.argv[2]);
const home = mkdtempSync(join(tmpdir(), 'nixie-spike-home-'));
const options: Options = {
  tools: [],
  allowedTools: ['mcp__nixie'],
  permissionMode: 'dontAsk',
  settingSources: [],
  strictMcpConfig: true,
  includePartialMessages: true,
  maxTurns: 20,
  model: process.env.NIXIE_MODEL ?? 'claude-haiku-5-5',
  mcpServers: {
    nixie: {
      type: 'http',
      url: readEnv('SPIKE_TOOLS_URL'),
      headers: { authorization: `Bearer ${readEnv('SPIKE_TOOLS_TOKEN')}` },
      alwaysLoad: true,
    },
  },
  cwd: home,
  env: buildEnv(home),
};
const started = performance.now();

emit('query', { scenario });
try {
  for await (const message of query({ prompt: prompts[scenario], options })) {
    writeMessage(message);
  }
} catch (error) {
  emit('thrown', { message: error instanceof Error ? error.message : String(error) });
}

function readScenario(value: string | undefined): keyof typeof prompts {
  if (value === 'rotation' || value === 'parallel') {
    return value;
  }
  throw new Error('usage: bun turn.ts rotation|parallel');
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`set ${name}`);
  }
  return value;
}

function buildEnv(homeDir: string): Record<string, string> {
  const passed = Object.fromEntries(
    brokerVariables.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );

  return {
    ...passed,
    PATH: readEnv('PATH'),
    HOME: homeDir,
    CLAUDE_CONFIG_DIR: join(homeDir, '.claude'),

    // The broker drops this header's value and sets the real token on the way out.
    CLAUDE_CODE_OAUTH_TOKEN: 'nixie-broker-placeholder',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}

function emit(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, guestMs: Math.round(performance.now() - started), ...fields }));
}

function writeMessage(message: SDKMessage): void {
  if (message.type === 'system' && message.subtype === 'init') {
    emit('init', {
      cli: message.claude_code_version,
      model: message.model,
      mcp: message.mcp_servers.map((server) => `${server.name}:${server.status}`),
      tools: message.tools,
    });
  } else if (message.type === 'system' && message.subtype === 'api_retry') {
    emit('api_retry', {
      attempt: message.attempt,
      maxRetries: message.max_retries,
      retryDelayMs: message.retry_delay_ms,
      status: message.error_status,
      error: message.error,
    });
  } else if (message.type === 'stream_event') {
    writeStreamEvent(message.event.type);
  } else if (message.type === 'assistant') {
    emit('assistant', {
      messageID: message.message.id,
      blocks: message.message.content.map((block) => block.type),
      toolUses: message.message.content.flatMap((block) =>
        block.type === 'tool_use' ? [{ id: block.id, name: block.name, input: block.input }] : [],
      ),
      ...(message.error === undefined ? {} : { error: message.error }),
    });
  } else if (message.type === 'user') {
    const content = message.message.content;
    emit('tool_results', {
      ids:
        typeof content === 'string'
          ? []
          : content.flatMap((block) => (block.type === 'tool_result' ? [block.tool_use_id] : [])),
    });
  } else if (message.type === 'result') {
    emit('result', {
      subtype: message.subtype,
      isError: message.is_error,
      turns: message.num_turns,
      durationMs: message.duration_ms,
      apiMs: message.duration_api_ms,
      costUSD: message.total_cost_usd,
      ...(message.subtype === 'success' ? { text: message.result } : { errors: message.errors }),
    });
  } else if (message.type === 'system') {
    emit('system', { subtype: message.subtype });
  }
}

// The start and stop of each streamed response bracket one model request on the guest's clock.
function writeStreamEvent(type: string): void {
  if (type === 'message_start' || type === 'message_stop') {
    emit(type);
  }
}
