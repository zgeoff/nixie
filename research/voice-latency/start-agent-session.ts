// One live Agent SDK process for a whole call: each turn sends the caller's words on a prompt queue
// that stays open, and streams the reply's text as it arrives.
import { once } from 'node:events';
import { join } from 'node:path';
import type {
  McpSdkServerConfigWithInstance,
  Options,
  SDKUserMessage,
  ThinkingConfig,
} from '@anthropic-ai/claude-agent-sdk';
import { match } from 'ts-pattern';
import type { ResultFields } from './build-result-fields.ts';
import { parseSessionMessage } from './parse-session-message.ts';

// The part of the SDK's query function that the session uses.
export type AgentQuery = (params: {
  options: Options;
  prompt: AsyncIterable<SDKUserMessage>;
}) => AsyncIterable<unknown> & { close: () => void };

export interface AgentTurn extends ResultFields {
  costUSD: number;
  resultAt: number;
  toolCalls: string[];
}

export interface AgentSessionOptions {
  allowedTools: string[];
  effort: 'low' | 'medium';
  env: Record<string, string>;
  model: string;
  // The Agent SDK's entry point, which starts the CLI process the session talks to.
  query: AgentQuery;
  // An empty folder for the CLI to run and keep its config in, so no file of the caller's reaches it.
  scratchDir: string;
  systemPrompt: string;
  thinking?: ThinkingConfig;
  tools?: McpSdkServerConfigWithInstance;
  writeLog: (line: string) => void;
}

export function startAgentSession(options: AgentSessionOptions): {
  close: () => void;
  runTurn: (prompt: string, onText: (delta: string, at: number) => void) => Promise<AgentTurn>;
} {
  const stream: Stream = { closed: false, events: new EventTarget(), queue: [] };
  const session = options.query({ options: buildOptions(options), prompt: sendQueued(stream) });
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
        const at = performance.now();
        const turn = match(parseSessionMessage(next.value))
          .returnType<AgentTurn | undefined>()
          .with({ kind: 'text' }, (message) => {
            onText(message.text, at);
            return undefined;
          })
          .with({ kind: 'tool-calls' }, (message) => {
            toolCalls.push(...message.names);
            return undefined;
          })
          .with({ kind: 'result' }, (message) => {
            // The SDK's cost counts the whole session, so each turn keeps the difference.
            const costUSD = message.totalCostUSD - sessionCostUSD;
            sessionCostUSD = message.totalCostUSD;
            return { ...message.fields, costUSD, resultAt: at, toolCalls };
          })
          .with({ kind: 'ignored' }, () => undefined)
          .exhaustive();
        if (turn !== undefined) {
          return turn;
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
  return {
    allowedTools: options.allowedTools,
    cwd: options.scratchDir,
    effort: options.effort,
    env: {
      ...options.env,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CONFIG_DIR: join(options.scratchDir, 'config'),
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
      options.writeLog(`[stderr] ${data}`);
    },
    strictMcpConfig: true,
    systemPrompt: { prompt: options.systemPrompt, snapshot: false, type: 'custom' },
    ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
    tools: [],
  };
}
