// Drives turns past the context window with the SDK's auto-compaction off, prints what the guest
// sees, and tries a compact-and-retry from the last committed boundary.
// Usage: bun --no-env-file overflow.ts <blocking|real|api|others> <config-dir>
import { resolve } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, getSessionMessages, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const scenario = process.argv.at(2),
  configDir = process.argv.at(3),
  cwd = resolve(import.meta.dir),
  model = 'claude-haiku-5-5';

if (!scenario || !configDir) {
  throw new Error('usage: overflow.ts <blocking|real|api|others> <config-dir>');
}

// getSessionMessages() reads sessions in this process, so it needs the directory.
process.env.CLAUDE_CONFIG_DIR = configDir;

interface Turn {
  abortAfterMs?: number;
  env?: Record<string, string>;
  extra?: Partial<Options>;
  label: string;
  pageTokens?: number;
  prompt: string;
}

interface TurnResult {
  answer: string;
  boundary: string | undefined;
  costUSD: number;
  sessionID: string | undefined;
}

// About 30 tokens a line. Each line is invented text with its own number, so no two lines
// match and the prompt cache cannot fold them.
function buildFiller(tokens: number, topic: string): string {
  const lines: string[] = [];

  for (let index = 0; lines.length * 30 < tokens; index += 1) {
    lines.push(
      `${topic} line ${String(index).padStart(6, '0')}: the tide gauge read ${(index * 37) % 211} cm and the gulls counted ${(index * 13) % 97}.`,
    );
  }
  return lines.join('\n');
}

// A page tool that returns a fixed amount of text, so each call grows the context by a known step.
function buildPageServer(pageTokens: number) {
  return createSdkMcpServer({
    name: 'pages',
    version: '0.0.0',
    tools: [
      tool(
        'read_page',
        'Reads one page of the harbour log.',
        { page: z.number().int() },
        async ({ page }) => ({
          content: [
            {
              type: 'text',
              text: `${buildFiller(pageTokens, `page ${page}`)}\nThe code word on page ${page} is ${['AMBER', 'BIRCH', 'CEDAR', 'DUNE', 'EMBER', 'FERN', 'GORSE', 'HAZEL'][page % 8]}.`,
            },
          ],
        }),
      ),
    ],
  });
}

function buildOptions(turn: Turn): Options {
  const pages = turn.pageTokens === undefined ? undefined : buildPageServer(turn.pageTokens);

  return {
    cwd,
    env: {
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CONFIG_DIR: configDir ?? '',
      HOME: process.env.HOME ?? '',
      PATH: process.env.PATH ?? '',
      ...pickProxyEnv(),
      ...(process.env.CLAUDE_CODE_OAUTH_TOKEN === undefined
        ? {}
        : { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN }),
      MAX_MCP_OUTPUT_TOKENS: '100000',
      ...turn.env,
    },
    model,
    settingSources: [],
    // the setting under test, as nixie's guest passes it
    settings: { autoCompactEnabled: false, autoCompactWindow: 100_000 },
    systemPrompt: 'You are a terse assistant in a test. Follow the instructions exactly.',
    tools: [],
    ...(pages === undefined
      ? {}
      : { allowedTools: ['mcp__pages'], mcpServers: { pages }, permissionMode: 'dontAsk' }),
    ...turn.extra,
  };
}

// a sandbox with a broker passes its proxy settings on, as nixie's guest does
function pickProxyEnv(): Record<string, string> {
  const names = ['HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'NODE_USE_ENV_PROXY'];
  const names2 = ['SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS'];

  return Object.fromEntries(
    [...names, ...names2].flatMap((name) => {
      const value = process.env[name];

      return value === undefined ? [] : [[name, value]];
    }),
  );
}

async function runTurn(turn: Turn): Promise<TurnResult> {
  const abortController = new AbortController(),
    result: TurnResult = { answer: '', boundary: undefined, costUSD: 0, sessionID: undefined },
    timer =
      turn.abortAfterMs === undefined
        ? undefined
        : setTimeout(() => abortController.abort(), turn.abortAfterMs);

  console.log(`\n--- ${turn.label}`);
  try {
    for await (const message of query({
      prompt: turn.prompt,
      options: { ...buildOptions(turn), abortController },
    })) {
      printMessage(message, result);
    }
  } catch (error) {
    console.log(`thrown: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
  return result;
}

function printMessage(message: SDKMessage, result: TurnResult): void {
  if ('session_id' in message && message.session_id) {
    result.sessionID = message.session_id;
  }
  if (message.type === 'assistant') {
    const text = message.message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(' ');
    const tools = message.message.content.flatMap((block) =>
      block.type === 'tool_use' ? [`${block.name}(${JSON.stringify(block.input)})`] : [],
    );
    const usage = message.message.usage;
    const context =
      usage.input_tokens +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0);

    if (message.error === undefined) {
      result.boundary = message.uuid;
      result.answer += text;
    }
    console.log(
      `assistant error=${message.error ?? '-'} context=${context} text=${JSON.stringify(text.slice(0, 160))} tools=${tools.join(',') || '-'}`,
    );
  } else if (message.type === 'user') {
    if (message.uuid !== undefined && message.parent_tool_use_id === null) {
      result.boundary = message.uuid;
    }
    console.log('user (tool result)');
  } else if (message.type === 'result') {
    result.costUSD = message.total_cost_usd;
    const shown = {
      subtype: message.subtype,
      is_error: message.is_error,
      terminal_reason: message.terminal_reason,
      stop_reason: message.stop_reason,
      num_turns: message.num_turns,
      result: message.subtype === 'success' ? message.result.slice(0, 160) : undefined,
      errors: message.subtype === 'success' ? undefined : message.errors,
      cost: message.total_cost_usd,
    };

    console.log(`result ${JSON.stringify(shown)}`);
  } else if (message.type === 'system' && message.subtype !== 'init') {
    console.log(`system ${message.subtype} ${JSON.stringify(message).slice(0, 300)}`);
  }
}

async function printTranscript(sessionID: string | undefined, label: string): Promise<void> {
  if (sessionID === undefined) {
    return;
  }
  const messages = await getSessionMessages(sessionID);

  console.log(`${label}: ${messages.length} messages, types ${messages.map((m) => m.type).join(',')}`);
}

const pageTask =
  'Use read_page to read pages 1, 2, 3 and 4, one call at a time and in that order. Then answer with the code word on page 4 only.';

// Turn 1 fills part of the window and commits. Turn 2 reads pages until the context passes the
// window. The step then forks at turn 1's boundary, asks for a summary with no tools, and runs
// turn 2 again on a new session that opens from the summary.
async function runRecovery(base: Partial<Turn>, fillTokens: number, pageTokens: number): Promise<number> {
  let cost = 0;
  const first = await runTurn({
    ...base,
    label: 'turn 1: fill and commit',
    prompt: `Here are harbour notes to keep in mind:\n${buildFiller(fillTokens, 'note')}\nReply with OK only.`,
  });

  cost += first.costUSD;
  const second = await runTurn({
    ...base,
    label: 'turn 2: read pages past the window',
    pageTokens,
    prompt: pageTask,
    extra: { resume: first.sessionID, resumeSessionAt: first.boundary, forkSession: true },
  });

  // a resumed session's result carries the cost its transcript saved, so the turn's own is the rise
  cost += second.costUSD - first.costUSD;
  await printTranscript(second.sessionID, 'transcript after the failed turn');
  const summary = await runTurn({
    ...base,
    label: 'compaction: fork at turn 1 boundary, no tools',
    prompt:
      '<system-message type="compaction">Write a summary of this session in under 80 words for your next session. Name what the notes cover.</system-message>',
    extra: { resume: first.sessionID, resumeSessionAt: first.boundary, forkSession: true },
  });

  cost += summary.costUSD - first.costUSD;
  const rerun = await runTurn({
    ...base,
    label: 'turn 2 again on a new session from the summary',
    pageTokens,
    prompt: `<system-message type="summary">${summary.answer}</system-message>\n\n${pageTask}`,
  });

  cost += rerun.costUSD;
  return cost;
}

async function runOthers(): Promise<number> {
  let cost = 0;
  const turns: Turn[] = [
    { label: 'unknown model', prompt: 'Say OK.', extra: { model: 'claude-nonesuch-9' } },
    {
      label: 'max turns',
      pageTokens: 100,
      prompt: pageTask,
      extra: { maxTurns: 1 },
    },
    {
      label: 'invalid request that is not an overflow',
      prompt: 'Say OK.',
      env: { CLAUDE_CODE_EXTRA_BODY: '{"temperature": 7}' },
    },
    {
      label: 'output cap',
      prompt: 'Write a 400-word story about a lighthouse.',
      env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16' },
    },
    { label: 'abort', prompt: 'Write a 400-word story about a lighthouse.', abortAfterMs: 1500 },
  ];

  for (const turn of turns) {
    cost += (await runTurn(turn)).costUSD;
  }
  return cost;
}

let spent = 0;

if (scenario === 'blocking') {
  // a small window: the CLI's blocking limit set to 24,000 tokens
  spent = await runRecovery({ env: { CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '24000' } }, 14_000, 4_000);
} else if (scenario === 'real') {
  // the model's own window, with nixie's settings and no override
  spent = await runRecovery({}, 140_000, 15_000);
} else if (scenario === 'api') {
  // The CLI's limit raised past the model's 1,000,000-token window, so the API itself refuses the
  // prompt. A refused prompt costs nothing.
  const turn = await runTurn({
    label: 'one prompt past the model window, CLI limit raised',
    env: { CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: '10000000' },
    prompt: `${buildFiller(1_050_000, 'note')}\nReply with OK only.`,
  });

  spent = turn.costUSD;
} else if (scenario === 'others') {
  spent = await runOthers();
}
console.log(`\nspent about $${spent.toFixed(3)}`);
