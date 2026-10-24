// One live Agent SDK process for a whole call: each turn sends the caller's words on a prompt queue
// that stays open, and streams the reply's text as it arrives.
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  McpSdkServerConfigWithInstance,
  Options,
  SDKMessage,
  SDKUserMessage,
  ThinkingConfig,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ResultFields } from './build-result-fields.ts';
import { buildResultFields } from './build-result-fields.ts';

export interface AgentTurn extends ResultFields {
  costUSD: number;
  resultAt: number;
  toolCalls: string[];
}

export interface AgentSessionOptions {
  allowedTools: string[];
  effort: 'low' | 'medium';
  model: string;
  systemPrompt: string;
  thinking?: ThinkingConfig;
  tools?: McpSdkServerConfigWithInstance;
}

export function startAgentSession(options: AgentSessionOptions): {
  close: () => void;
  runTurn: (prompt: string, onText: (delta: string, at: number) => void) => Promise<AgentTurn>;
} {
  const stream: Stream = { closed: false, events: new EventTarget(), queue: [] };
  const session = query({ options: buildOptions(options), prompt: sendQueued(stream) });
  const messages = session[Symbol.asyncIterator]();
  let sessionCostUSD = 0;
  return {
    close: () => {
      stream.closed = true;
      stream.events.dispatchEvent(new Event('push'));
      session.close();
    },
    runTurn: async (prompt, onText) => {
      stream.queue.push({ message: { content: prompt, role: 'user' }, parent_tool_use_id: null, type: 'user' });
      stream.events.dispatchEvent(new Event('push'));
      const toolCalls: string[] = [];
      for (;;) {
        const next = await messages.next();
        if (next.done) {
          throw new Error('the session ended mid-turn');
        }
        const message: SDKMessage = next.value;
        const at = performance.now();
        if (message.type === 'stream_event' && message.parent_tool_use_id === null) {
          const { event } = message;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            onText(event.delta.text, at);
          }
        } else if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolCalls.push(block.name);
            }
          }
        } else if (message.type === 'result') {
          // total_cost_usd counts the whole session, so each turn keeps the difference.
          const costUSD = message.total_cost_usd - sessionCostUSD;
          sessionCostUSD = message.total_cost_usd;
          return { ...buildResultFields(message), costUSD, resultAt: at, toolCalls };
        }
      }
    },
  };
}

interface Stream {
  closed: boolean;
  events: EventTarget;
  queue: SDKUserMessage[];
}

async function* sendQueued(stream: Stream): AsyncGenerator<SDKUserMessage> {
  while (!stream.closed) {
    const next = stream.queue.shift();
    if (next) {
      yield next;
    } else {
      await once(stream.events, 'push');
    }
  }
}

function buildOptions(options: AgentSessionOptions): Options {
  const scratch = mkdtempSync(join(tmpdir(), 'voice-reply-'));
  return {
    allowedTools: options.allowedTools,
    cwd: scratch,
    effort: options.effort,
    env: {
      ...pickEnv(),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CONFIG_DIR: join(scratch, 'config'),
    },
    includePartialMessages: true,
    // A tool turn takes a call and an answer; the cap only stops a runaway loop.
    maxTurns: 4,
    mcpServers: options.tools === undefined ? {} : { voice: options.tools },
    model: options.model,
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    settingSources: [],
    stderr: (data) => {
      process.stderr.write(`[stderr] ${data}`);
    },
    strictMcpConfig: true,
    systemPrompt: { prompt: options.systemPrompt, snapshot: false, type: 'custom' },
    ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
    tools: [],
  };
}

// The credential and the network settings the CLI needs, and nothing else from this shell.
function pickEnv(): Record<string, string> {
  const keys = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'HOME',
    'HTTPS_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'NODE_USE_ENV_PROXY',
    'NO_PROXY',
    'PATH',
    'SSL_CERT_FILE',
    'https_proxy',
    'no_proxy',
  ];
  return Object.fromEntries(keys.flatMap((key) => {
    const value = process.env[key];
    return value === undefined ? [] : [[key, value]];
  }));
}
